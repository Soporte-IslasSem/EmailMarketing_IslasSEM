// Lector de buzón (IMAP): detecta respuestas de clientes y avanza la negociación.
// Emparejamiento profesional por hilo de correo (In-Reply-To / References → Message-ID
// guardado al enviar), con respaldo por email del remitente. Registra cada entrante.
// Corre en el mismo cron. Si no hay credenciales IMAP, se desactiva solo (no rompe).
const { db } = require("./firebase");
const { nextPosStage } = require("./stages");
const { DEFAULT_ORG_ID, norm, resolvePerson, addActivity } = require("./link");

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

// Correo masivo (newsletter, publicidad, notificación automática): no debe crear prospectos.
function isBulk(parsed, fromEmail) {
  const h = parsed.headers;
  if (h?.get?.("list-unsubscribe") || h?.get?.("list-id")) return true;
  if (String(h?.get?.("precedence") || "").toLowerCase() === "list") return true;
  return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifica(tions?|ciones)|news(letter)?|marketing|info@.*(mailchimp|sendgrid|hubspot))/i.test(fromEmail || "");
}

// Busca la negociación a la que corresponde la respuesta.
async function matchDeal(refIds, fromEmail) {
  // 1) Por hilo: outbox cuyo messageId esté en las referencias del correo.
  for (let i = 0; i < refIds.length; i += 10) {
    const chunk = refIds.slice(i, i + 10).map((x) => `<${x}>`).concat(refIds.slice(i, i + 10));
    const snap = await db.collection("outbox").where("messageId", "in", chunk.slice(0, 10)).get().catch(() => null);
    if (snap && !snap.empty) {
      const dealId = snap.docs.map((d) => d.data().dealId).find(Boolean);
      if (dealId) { const ds = await db.collection("deals").doc(dealId).get(); if (ds.exists) return { ref: ds.ref, data: ds.data() }; }
    }
  }
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
  const refIds = collectRefIds(parsed);
  const match = await matchDeal(refIds, fromEmail);
  const snippet = (parsed.text || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!match) return handleNewEmail(parsed, fromEmail, snippet);
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

// Correo que no responde a ninguna negociación: se guarda en la ficha del contacto
// (o del prospecto); si el remitente es desconocido, se crea un prospecto con origen
// "Email" — igual que hacía Bitrix (allí ~todos los prospectos entraban así).
async function handleNewEmail(parsed, fromEmail, snippet) {
  if (!fromEmail || fromEmail === norm(process.env.IMAP_USER)) return { matched: false };
  const orgId = DEFAULT_ORG_ID;
  const fromName = parsed.from?.value?.[0]?.name || "";
  const [firstName, ...rest] = fromName.split(" ");
  const person = await resolvePerson(orgId, {
    create: !isBulk(parsed, fromEmail), // masivos: solo si ya es contacto/prospecto
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
  let matched = 0, scanned = 0, newLeads = 0;
  await client.connect();
  const pipesSnap = await db.collection("pipelines").get();
  const pipelines = pipesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cursorRef = db.collection("system").doc("imapCursor");
  const lock = await client.getMailboxLock("INBOX");
  try {
    const box = client.mailbox;
    const uidValidity = String(box.uidValidity);
    const cur = (await cursorRef.get()).data();
    // Primera ejecución (o buzón recreado): arrancar desde "ahora", sin procesar historial.
    if (!cur || cur.uidValidity !== uidValidity) {
      await cursorRef.set({ uidValidity, lastUid: box.uidNext - 1, startedAt: new Date() });
      return { initialized: true, from: box.uidNext };
    }
    let lastUid = cur.lastUid;
    if (box.uidNext - 1 > lastUid) {
      for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= lastUid) continue; // "N:*" devuelve el último aunque sea anterior
        scanned++;
        try {
          const parsed = await simpleParser(msg.source);
          if (!isAutoReply(parsed)) {
            const r = await handleReply(parsed, pipelines);
            if (r.matched) matched++;
            if (r.newLead) newLeads++;
          }
        } catch (e) { console.warn("[inbox] parse:", e.message); }
        lastUid = Math.max(lastUid, msg.uid);
        if (scanned >= 100) break; // tope por pasada; el resto en la siguiente
      }
      await cursorRef.set({ uidValidity, lastUid, updatedAt: new Date() }, { merge: true });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return { scanned, matched, newLeads };
}

module.exports = { processReplies, isBulk };
