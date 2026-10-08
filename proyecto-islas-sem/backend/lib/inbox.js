// Lector de buzón (IMAP): detecta respuestas de clientes y avanza la negociación.
// Emparejamiento profesional por hilo de correo (In-Reply-To / References → Message-ID
// guardado al enviar), con respaldo por email del remitente. Registra cada entrante.
// Corre en el mismo cron. Si no hay credenciales IMAP, se desactiva solo (no rompe).
const { db } = require("./firebase");
const { nextPosStage } = require("./stages");
const { DEFAULT_ORG_ID, norm, resolvePerson, addActivity } = require("./link");
const { recordBounce, recordReply } = require("./reports");
const { fireWebhook } = require("./webhooks");

function imapConfigured() {
  return process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD;
}

const normId = (s) => String(s || "").trim().replace(/^<|>$/g, "");
function collectRefIds(parsed) {
  const ids = new Set();
  if (parsed.inReplyTo) String(parsed.inReplyTo).split(/\s+/).forEach((x) => x && ids.add(normId(x)));
  const refs = parsed.references;
  if (Array.isArray(refs)) refs.forEach((x) => ids.add(normId(x)));
  else if (refs) String(refs).split(/\s+/).forEach((x) => x && ids.add(normId(x)));
  return [...ids].filter(Boolean);
}

function isAutoReply(parsed) {
  const h = parsed.headers;
  const auto = h?.get?.("auto-submitted");
  if (auto && String(auto).toLowerCase() !== "no") return true;
  const prec = String(h?.get?.("precedence") || "").toLowerCase();
  if (["bulk", "auto_reply", "junk"].includes(prec)) return true;
  return /out of office|automatic reply|vacation|fuera de la oficina|respuesta autom/i.test(parsed.subject || "");
}

// Aviso de no entrega (DSN) de Gmail u otro servidor: devuelve { email, hard } o null.
function parseBounce(parsed) {
  const from = String(parsed.from?.value?.[0]?.address || "").toLowerCase();
  const ctype = String(parsed.headers?.get?.("content-type")?.value || parsed.headers?.get?.("content-type") || "").toLowerCase();
  const isDsn = /^(mailer-daemon|postmaster)@/.test(from) || ctype.includes("report-type=delivery-status") ||
    /delivery status notification|undeliverable|undelivered mail|returned mail|no se ha entregado|mail delivery failed/i.test(parsed.subject || "");
  if (!isDsn) return null;
  const text = [parsed.text || "", ...(parsed.attachments || []).map((a) => a.content?.toString?.("utf8") || "")].join("\n");
  const failed = parsed.headers?.get?.("x-failed-recipients");
  const m = (failed && String(failed).match(/[\w.+-]+@[\w.-]+\.\w+/)) ||
    text.match(/Final-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/i) ||
    text.match(/(?:wasn't delivered to|no se ha entregado a|delivery to the following recipients? failed[^\n]*\n)\s*<?([\w.+-]+@[\w.-]+\.\w+)/i);
  const email = m ? String(m[1] || m[0]).toLowerCase() : "";
  if (!email) return null;
  const status = (text.match(/Status:\s*([245])\.\d+\.\d+/i) || [])[1];
  const hard = status ? status === "5" : !/temporar|try again|mailbox full|quota|4\.\d\.\d/i.test(text);
  return { email, hard };
}

async function handleBounce(b) {
  // Campaña más reciente enviada a ese email (sin índice compuesto: se filtra en código).
  const snap = await db.collection("outbox").where("to", "==", b.email).limit(50).get().catch(() => null);
  const last = snap?.docs.map((d) => d.data()).filter((x) => x.kind === "campaign" && x.campaignId)
    .sort((x, y) => (y.sentAt || 0) - (x.sentAt || 0))[0];
  if (last) await recordBounce(last.campaignId, b.email, b.hard);
  if (b.hard) {
    const subs = await db.collection("subscribers").where("email", "==", b.email).get().catch(() => null);
    for (const d of subs?.docs || []) {
      await d.ref.update({ status: "bounced", bouncedAt: Date.now() });
      fireWebhook(d.data().listId, "bounce", { email: b.email, subscriberId: d.id, hard: true });
    }
  }
  return { bounced: true };
}

// Correo masivo (newsletter, publicidad, notificación automática): no debe crear prospectos.
function isBulk(parsed, fromEmail) {
  const h = parsed.headers;
  if (h?.get?.("list-unsubscribe") || h?.get?.("list-id")) return true;
  if (String(h?.get?.("precedence") || "").toLowerCase() === "list") return true;
  return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifica(tions?|ciones)|news(letter)?|marketing|info@.*(mailchimp|sendgrid|hubspot))/i.test(fromEmail || "");
}

// Correos nuestros (outbox) a los que responde este mensaje, por su Message-ID.
async function threadOutbox(refIds) {
  const ids = [...new Set(refIds.flatMap((x) => [x, `<${x}>`]))];
  const items = [];
  for (let i = 0; i < ids.length; i += 10) {
    const snap = await db.collection("outbox").where("messageId", "in", ids.slice(i, i + 10)).get().catch(() => null);
    snap?.docs.forEach((d) => items.push({ id: d.id, ...d.data() }));
  }
  return items;
}

// Busca la negociación a la que corresponde la respuesta.
async function matchDeal(thread, fromEmail) {
  // 1) Por hilo: oferta enviada desde una negociación.
  const dealId = thread.map((o) => o.dealId).find(Boolean);
  if (dealId) { const ds = await db.collection("deals").doc(dealId).get(); if (ds.exists) return { ref: ds.ref, data: ds.data() }; }
  // Respuesta a una campaña/automatización: no se asigna a una negociación por email.
  if (thread.some((o) => o.kind === "campaign" || o.kind === "automation")) return null;
  // 2) Respaldo: por email del remitente, negociación esperando respuesta.
  if (fromEmail) {
    const snap = await db.collection("deals").where("contactEmail", "==", fromEmail).get().catch(() => null);
    if (snap && !snap.empty) {
      const waiting = snap.docs.find((d) => d.data().offer?.state === "enviada") || snap.docs[0];
      return { ref: waiting.ref, data: waiting.data() };
    }
  }
  return null;
}

async function handleReply(parsed, pipelines) {
  const fromEmail = (parsed.from?.value?.[0]?.address || "").toLowerCase();
  const thread = await threadOutbox(collectRefIds(parsed));
  const match = await matchDeal(thread, fromEmail);
  const snippet = (parsed.text || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!match) {
    const sent = thread.find((o) => (o.kind === "campaign" || o.kind === "automation") && !o.isTest);
    return sent ? handleCampaignReply(parsed, fromEmail, sent) : handleNewEmail(parsed, fromEmail, snippet);
  }
  const deal = { id: match.ref.id, ...match.data };

  // Registro de auditoría del correo entrante (queda en la ficha del contacto).
  await db.collection("inbound").add({
    orgId: deal.orgId, dealId: deal.id, contactId: deal.contactId || "",
    from: fromEmail, subject: parsed.subject || "", snippet, createdAt: new Date(),
  });
  await db.collection("activities").add({
    orgId: deal.orgId, type: "Email",
    title: `📥 Respuesta: "${(parsed.subject || "").slice(0, 70)}"${snippet ? ` — ${snippet.slice(0, 140)}` : ""}`,
    body: snippet, from: fromEmail, subject: parsed.subject || "",
    entity: "deal", entityId: deal.id, contactId: deal.contactId || "",
    done: false, auto: true, createdAt: new Date(),
  });

  // Si estaba esperando respuesta: marcar respondió y avanzar de etapa.
  if (deal.offer?.state === "enviada") {
    const pipeline = pipelines.find((p) => p.id === deal.pipelineId) || pipelines[0];
    const next = pipeline ? nextPosStage(pipeline, deal.stage) : null;
    const patch = { offer: { ...deal.offer, state: "respondio", respondedAt: Date.now() } };
    if (next && next.id !== deal.stage) patch.stage = next.id;
    await match.ref.update(patch);
    await db.collection("activities").add({
      orgId: deal.orgId, type: "Nota",
      title: `✅ Automatización · Cliente respondió a tiempo${patch.stage ? ` → etapa "${next.name}"` : ""}`,
      entity: "deal", entityId: deal.id, contactId: deal.contactId || "", done: false, auto: true, createdAt: new Date(),
    });
  }
  return { matched: true, dealId: deal.id };
}

// Respuesta a una campaña o automatización nuestra: es un interesado, así que se registra
// aunque no esté en el CRM (crea un prospecto "Respuesta a campaña") y cuenta en el informe.
async function handleCampaignReply(parsed, fromEmail, sent) {
  if (!fromEmail || fromEmail === norm(process.env.IMAP_USER)) return { matched: false };
  const orgId = sent.orgId || DEFAULT_ORG_ID;
  let name = "";
  if (sent.kind === "campaign" && sent.campaignId) {
    const c = await db.collection("campaigns").doc(sent.campaignId).get().catch(() => null);
    name = c?.exists ? c.data().config?.campaignName || c.data().name || "" : "";
  } else if (sent.automationId) {
    const a = await db.collection("automations").doc(sent.automationId).get().catch(() => null);
    name = a?.exists ? a.data().name || "" : "";
  }
  const origin = `${sent.kind === "automation" ? "la automatización" : "la campaña"}${name ? ` "${name.slice(0, 80)}"` : ""}`;
  const fromName = parsed.from?.value?.[0]?.name || sent.toName || "";
  const [firstName, ...rest] = fromName.split(" ");
  const person = await resolvePerson(orgId, {
    create: true, email: fromEmail, firstName, lastName: rest.join(" "),
    source: sent.kind === "automation" ? "Respuesta a automatización" : "Respuesta a campaña",
    notes: `Respondió a ${origin}: "${(parsed.subject || "").slice(0, 120)}"`,
  });
  const text = (parsed.text || "").slice(0, 20000);
  await db.collection("inbound").add({
    orgId, dealId: "", contactId: person.contactId, leadId: person.leadId,
    campaignId: sent.campaignId || "", automationId: sent.automationId || "",
    from: fromEmail, subject: parsed.subject || "", snippet: text.replace(/\s+/g, " ").trim().slice(0, 240), createdAt: new Date(),
  });
  await addActivity(orgId, {
    type: "Email",
    title: `📥 Respuesta a ${origin}: "${(parsed.subject || "(sin asunto)").slice(0, 90)}"`,
    body: text, from: fromEmail, subject: parsed.subject || "",
    entity: person.leadId ? "lead" : "contact", entityId: person.leadId || person.contactId,
    contactId: person.contactId, leadId: person.leadId,
  });
  if (sent.campaignId) await recordReply(sent.campaignId, sent.to);
  return { matched: true, newLead: person.created };
}

// Correo que no responde a ninguna negociación: se guarda en la ficha del contacto
// (o del prospecto) si el remitente ya existe en el CRM. Los desconocidos se ignoran
// salvo EMAIL_NEW_LEADS=true (entonces crean un prospecto con origen "Email").
async function handleNewEmail(parsed, fromEmail, snippet) {
  if (!fromEmail || fromEmail === norm(process.env.IMAP_USER)) return { matched: false };
  const orgId = DEFAULT_ORG_ID;
  const fromName = parsed.from?.value?.[0]?.name || "";
  const [firstName, ...rest] = fromName.split(" ");
  const person = await resolvePerson(orgId, {
    // Por defecto solo se registran correos de contactos/prospectos existentes; crear
    // prospectos desde remitentes desconocidos se activa con EMAIL_NEW_LEADS=true.
    create: process.env.EMAIL_NEW_LEADS === "true" && !isBulk(parsed, fromEmail),
    email: fromEmail, firstName, lastName: rest.join(" "),
    source: "Email", notes: `Entró por correo: "${(parsed.subject || "").slice(0, 120)}"`,
  });
  if (!person.contactId && !person.leadId) return { matched: false }; // masivo de desconocido
  await db.collection("inbound").add({
    orgId, dealId: "", contactId: person.contactId, leadId: person.leadId,
    from: fromEmail, subject: parsed.subject || "", snippet, createdAt: new Date(),
  });
  await addActivity(orgId, {
    type: "Email",
    title: `📥 Correo recibido: "${(parsed.subject || "(sin asunto)").slice(0, 90)}"`,
    body: (parsed.text || "").slice(0, 20000), from: fromEmail, subject: parsed.subject || "",
    entity: person.leadId ? "lead" : person.contactId ? "contact" : null,
    entityId: person.leadId || person.contactId || null,
    contactId: person.contactId, leadId: person.leadId,
  });
  return { matched: true, newLead: person.created };
}

// Cursor por UID en Firestore (system/imapCursor): solo se procesan los correos que
// llegan DESPUÉS de activar el backend, sin tocar los existentes (la bandeja ya tiene
// miles) y sin marcarlos como leídos — la bandeja la siguen usando personas.
async function processReplies() {
  if (!imapConfigured()) return { skipped: "IMAP no configurado" };
  const { ImapFlow } = require("imapflow");
  const { simpleParser } = require("mailparser");
  const port = Number(process.env.IMAP_PORT) || 993;
  const client = new ImapFlow({
    host: process.env.IMAP_HOST, port, secure: port === 993,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD }, logger: false,
  });
  let matched = 0, scanned = 0, newLeads = 0, bounces = 0;
  await client.connect();
  const pipesSnap = await db.collection("pipelines").get();
  const pipelines = pipesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cursorRef = db.collection("system").doc("imapCursor");
  const lock = await client.getMailboxLock("INBOX");
  try {
    const box = client.mailbox;
    const uidValidity = String(box.uidValidity);
    const account = String(process.env.IMAP_USER).trim().toLowerCase();
    const cur = (await cursorRef.get()).data();
    // Primera ejecución, buzón recreado o cambio de cuenta (los UID son por buzón y Gmail
    // repite uidValidity entre cuentas): arrancar desde "ahora", sin procesar historial.
    if (!cur || cur.uidValidity !== uidValidity || cur.account !== account) {
      await cursorRef.set({ uidValidity, account, lastUid: box.uidNext - 1, startedAt: new Date() });
      return { initialized: true, from: box.uidNext };
    }
    let lastUid = cur.lastUid;
    if (box.uidNext - 1 > lastUid) {
      for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= lastUid) continue; // "N:*" devuelve el último aunque sea anterior
        scanned++;
        try {
          const parsed = await simpleParser(msg.source);
          const bounce = parseBounce(parsed);
          if (bounce) { await handleBounce(bounce); bounces++; }
          else if (!isAutoReply(parsed)) {
            const r = await handleReply(parsed, pipelines);
            if (r.matched) matched++;
            if (r.newLead) newLeads++;
          }
        } catch (e) { console.warn("[inbox] parse:", e.message); }
        lastUid = Math.max(lastUid, msg.uid);
        if (scanned >= 100) break; // tope por pasada; el resto en la siguiente
      }
      await cursorRef.set({ uidValidity, account, lastUid, updatedAt: new Date() }, { merge: true });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return { scanned, matched, newLeads, bounces };
}

module.exports = { processReplies, isBulk, parseBounce, __test: { handleReply } };
