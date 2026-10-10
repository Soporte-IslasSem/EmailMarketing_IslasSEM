// Flujo automático de las negociaciones (24/7, en el cron).
//
// 1) Entrada en etapa: cuando una negociación del Kanban positivo está en una etapa
//    distinta de la última que procesó el motor (deal.flowStage), se ejecutan las reglas
//    de esa etapa (pipeline.automations[stageId]), la haya movido quien sea: una persona,
//    un formulario, una respuesta o el propio motor.
//    - Cada regla puede tener `interest` ("rgpd, protección de datos"): solo se aplica si
//      la negociación trata de eso (productos, título, notas, campos). Vacío = siempre.
//    - Tarea / Control / Notificación → tarea para el responsable.
//    - Enviar formulario / Enviar correo → correo al cliente (outbox) con el enlace al
//      formulario de esa negociación, y la negociación queda ESPERANDO RESPUESTA
//      `waitH` horas (por defecto 72; 0 = no esperar).
// 2) Respuesta (respond): un formulario rellenado o un correo respondido mientras espera
//    → pasa a la siguiente etapa, que vuelve a disparar sus reglas (paso 1).
// 3) Sin respuesta: si vence el plazo → Kanban Negativo + tarea de re-contacto.
// 4) Respuesta tardía (ya en el Negativo por no responder): vuelve al Kanban positivo, a la
//    etapa siguiente a la que estaba, con una tarea para que el responsable lo revise.
//
// Las negociaciones que ya existían al activar el motor (antes de organizations.flowSince)
// no disparan nada hasta que cambien de etapa.
//
// Garantías:
// - Nunca se ejecuta dos veces la misma entrada en etapa: antes de enviar nada se "reclama"
//   en una transacción (flowStage) y solo la ejecución que la reclama la procesa, aunque
//   haya dos crons solapados o el servidor se reinicie a mitad.
// - Solo se leen las negociaciones que cambiaron desde la última vuelta (updatedAt) y las
//   que esperan respuesta: el coste no crece con el tamaño del CRM.
const { db } = require("./firebase");
const { DEFAULT_ORG_ID, addActivity } = require("./link");
const { getStages, flattenStages, findStage, nextPosStage, pickNegTarget, plazoTxt } = require("./stages");

const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
const WHEN_DAYS = { immediately: 0, "1d": 1, "3d": 3, "7d": 7 };
const DEFAULT_WAIT_H = 72;
const isSend = (r) => r.action === "form" || r.action === "email";
const waitOf = (r) => (isSend(r) ? (r.waitH === 0 || r.waitH === "0" ? 0 : Number(r.waitH) || DEFAULT_WAIT_H) : 0);
const ymd = (d) => d.toISOString().slice(0, 10);
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Texto de lo que trata la negociación, para las reglas por interés.
function interestText(d) {
  return [
    d.title, d.notes, d.sourceInfo, d.type,
    ...(d.items || []).map((i) => i.name),
    ...Object.values(d.custom || {}),
    ...(d.extraFields || []).map((f) => `${f.label} ${f.value}`),
  ].filter(Boolean).join(" ").toLowerCase();
}
function matchesInterest(rule, text) {
  const keys = String(rule.interest || "").toLowerCase().split(",").map((k) => k.trim()).filter(Boolean);
  return !keys.length || keys.some((k) => text.includes(k));
}
// Filtros de la regla por cliente: tipo de cliente del contacto/empresa (RGPD, Kit Digital…)
// y relación de la negociación (nuevo / recurrente / VIP). Vacío = cualquiera.
function matchesClient(rule, clientType, relation) {
  if (rule.clientType && rule.clientType !== clientType) return false;
  if (rule.relation && rule.relation !== relation) return false;
  return true;
}

function emailHtml({ title, body, cta, ctaUrl }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a3a3a;max-width:560px;margin:auto">
    <div style="background:#136B68;color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">ISLAS SEM</div>
    <div style="padding:20px;border:1px solid #e3eaea;border-top:none">
      <h2 style="color:#136B68;margin:0 0 12px">${esc(title)}</h2>
      <div style="font-size:14px;line-height:1.6">${body}</div>
      ${cta && ctaUrl ? `<p style="margin-top:20px"><a href="${ctaUrl}" style="background:#E2B83C;color:#1f2d2d;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">${esc(cta)}</a></p>` : ""}
    </div>
    <div style="padding:12px 20px;font-size:11px;color:#9aa8a8">ISLAS SEM SLU · Canarias · www.islassem.com</div>
  </div>`;
}

async function contactEmailOf(d) {
  if (d.contactEmail) return d.contactEmail;
  if (!d.contactId) return "";
  const c = await db.collection("contacts").doc(d.contactId).get().catch(() => null);
  return c?.exists ? String(c.data().email || "") : "";
}

// Ejecuta las reglas de la etapa actual. Devuelve las horas máximas de espera (0 = no espera).
async function runRules(pipeline, deal) {
  const stageName = findStage(getStages(pipeline, "pos"), deal.stage)?.name || deal.stage;
  const text = interestText(deal);
  // Tipo de cliente: el del contacto o, si no tiene, el de su empresa.
  let clientType = "";
  if (deal.contactId) {
    const c = await db.collection("contacts").doc(deal.contactId).get().catch(() => null);
    clientType = (c?.exists && c.data().clientType) || "";
    if (!clientType && c?.exists && c.data().companyId) {
      const co = await db.collection("companies").doc(c.data().companyId).get().catch(() => null);
      clientType = (co?.exists && co.data().clientType) || "";
    }
  }
  const relation = deal.clientType || "nuevo";
  const rules = ((pipeline.automations || {})[deal.stage] || []).filter((r) => matchesInterest(r, text) && matchesClient(r, clientType, relation));
  if (!rules.length) return { ran: 0, waitH: 0 };
  const email = await contactEmailOf(deal);
  let waitH = 0;
  for (const r of rules) {
    const days = WHEN_DAYS[r.when] ?? 0;
    const due = new Date(Date.now() + days * 864e5);
    const assignee = r.to === "supervisor" ? "Supervisor" : deal.responsable || "Responsable";
    const owner = r.to === "supervisor" ? {} : { assigneeType: "person", assigneeId: "", assigneeName: deal.responsable || "", assigneeEmail: deal.ownerEmail || "" };
    if (!isSend(r)) {
      const type = r.action === "task" ? "Tarea" : r.action === "control" ? "Seguimiento" : "Nota";
      await addActivity(deal.orgId, {
        type, title: `⚙ ${r.title || type} → ${assignee} (${deal.title} · ${stageName})`,
        entity: "deal", entityId: deal.id, contactId: deal.contactId || "", dueDate: ymd(due), assignee, priority: "Media", ...owner,
      });
      continue;
    }
    // Envío al cliente: formulario (enlace a /f/<form>/<deal>) o correo.
    const t = String(r.title || "").toLowerCase();
    const formId = r.action === "form" && /^[A-Za-z0-9_-]{1,64}$/.test(r.formId || "") ? r.formId
      : r.action === "form" && /sepa/.test(t) ? "sepa" : r.action === "form" && /jur[íi]dic/.test(t) ? "juridicos" : "";
    const ctaUrl = formId ? `${PUBLIC_URL}/f/${formId}/${deal.id}` : "";
    const greeting = `Hola ${esc(deal.contact || "")},<br><br>`;
    const body = r.message
      ? greeting + esc(r.message).replace(/\n/g, "<br>")
      : `${greeting}En relación con <b>${esc(deal.title)}</b>, ${ctaUrl ? "necesitamos que completes el siguiente formulario" : "te escribimos sobre"}: <b>${esc(r.title || "documento")}</b>.`;
    await db.collection("outbox").add({
      orgId: deal.orgId, to: email, toName: deal.contact || "",
      subject: r.subject || `${r.title || "Documento"} · ISLAS SEM`,
      html: emailHtml({ title: r.title || "ISLAS SEM", body, cta: ctaUrl ? "Rellenar formulario" : "", ctaUrl }),
      text: "", kind: formId === "sepa" ? "sepa" : formId === "juridicos" ? "juridicos" : r.action === "form" ? "form" : "email",
      status: !email ? "skipped" : days ? "scheduled" : "pending", ...(days ? { sendAfter: due.getTime() } : {}),
      dealId: deal.id, contactId: deal.contactId || "", attachment: null, attempts: 0,
      error: email ? "" : "Sin email del destinatario", sentAt: null, source: "stageflow", createdAt: new Date(), updatedAt: new Date(),
    });
    await addActivity(deal.orgId, {
      type: r.action === "form" ? "Documento" : "Email",
      title: email
        ? `${r.action === "form" ? "📄 Enviado" : "✉️ Correo"}: ${r.title || "Documento"} → ${deal.contact || email} (${stageName})${days ? ` · en ${days} día(s)` : ""}`
        : `⚠ No se pudo enviar "${r.title || "Documento"}": la negociación no tiene email del cliente`,
      entity: "deal", entityId: deal.id, contactId: deal.contactId || "", done: !!email,
    });
    if (email) waitH = Math.max(waitH, waitOf(r) + days * 24);
  }
  return { ran: rules.length, waitH };
}

// Reclama (en transacción) la entrada en etapa `key` de una negociación. Solo devuelve el
// documento a quien la reclama primero; el resto recibe null.
async function claim(ref, key, since) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    if (d.flowStage === key) return null;
    tx.update(ref, { flowStage: key, flowClaimedAt: Date.now() });
    const created = d.createdAt?.toMillis?.() || 0;
    // Negociación anterior al motor que nunca se procesó: se marca sin enviar nada.
    if (d.flowStage === undefined && created < since) return null;
    return { id: snap.id, ...d };
  });
}

// Respuesta del cliente (formulario o correo) a una negociación que esperaba → siguiente etapa.
// En transacción: dos respuestas casi a la vez solo avanzan una etapa.
async function respond(dealId, via) {
  const ref = db.collection("deals").doc(dealId);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    const pipeline = await tx.get(db.collection("pipelines").doc(d.pipelineId || "-"));
    // Tardía: está en el Negativo porque venció el plazo (motor u oferta) y sabemos de qué etapa venía.
    const late = (d.board || "pos") === "neg" && d.prevStage && (d.flow?.expiredAt || d.offer?.escalatedAt);
    if (late) {
      const next = pipeline.exists ? nextPosStage(pipeline.data(), d.prevStage) : null;
      const patch = {
        board: "pos", stage: next?.id || d.prevStage,
        flow: { ...(d.flow || {}), waiting: false, respondedAt: Date.now(), respondedVia: via, lateReply: true },
        ...(d.offer?.state === "seguimiento" ? { offer: { ...d.offer, state: "respondio", respondedAt: Date.now() } } : {}),
        updatedAt: new Date(),
      };
      tx.update(ref, patch);
      return { d, next, patch, late: true };
    }
    if (!d.flow?.waiting || d.flow.stage !== d.stage || (d.board || "pos") !== "pos") return null;
    const next = pipeline.exists ? nextPosStage(pipeline.data(), d.stage) : null;
    const patch = { flow: { ...d.flow, waiting: false, respondedAt: Date.now(), respondedVia: via }, updatedAt: new Date() };
    if (next && next.id !== d.stage) patch.stage = next.id;
    tx.update(ref, patch);
    return { d, next, patch };
  });
  if (!res) return false;
  const { d, next, patch, late } = res;
  if (late) {
    await addActivity(d.orgId, {
      type: "Tarea", title: `⚠ Respondió tarde (${via}): revisar "${d.title}" — vuelve al Kanban en "${next?.name || "su etapa"}"`,
      entity: "deal", entityId: dealId, contactId: d.contactId || "", dueDate: new Date().toISOString().slice(0, 10), priority: "Alta",
      assignee: d.responsable || "Responsable", assigneeType: "person", assigneeId: "", assigneeName: d.responsable || "", assigneeEmail: d.ownerEmail || "",
    });
  }
  await addActivity(d.orgId, {
    type: "Nota", title: `✅ Automatización · Respondió${late ? " tarde, desde el Kanban Negativo" : ""} (${via})${patch.stage ? ` → etapa "${next?.name || patch.stage}"` : ""}`,
    entity: "deal", entityId: dealId, contactId: d.contactId || "",
  });
  return true;
}

async function runStageFlow() {
  const orgRef = db.collection("organizations").doc(DEFAULT_ORG_ID);
  const org = (await orgRef.get()).data() || {};
  let since = org.flowSince?.toMillis?.() || 0;
  if (!since) { since = Date.now(); await orgRef.set({ flowSince: new Date(since) }, { merge: true }); }

  const pipelines = Object.fromEntries((await db.collection("pipelines").where("orgId", "==", DEFAULT_ORG_ID).get()).docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const now = Date.now();
  // Solo lo que cambió desde la última vuelta (con 3 min de margen) y lo que espera
  // respuesta. La primera vez, todo (para marcar las negociaciones existentes).
  const last = org.flowLastRun || 0;
  const byId = new Map();
  const add = (snap) => snap.docs.forEach((d) => d.data().orgId === DEFAULT_ORG_ID && byId.set(d.id, d));
  if (!last) add(await db.collection("deals").where("orgId", "==", DEFAULT_ORG_ID).get());
  else {
    add(await db.collection("deals").where("updatedAt", ">=", new Date(last - 180e3)).get());
    add(await db.collection("deals").where("flow.waiting", "==", true).get());
  }
  const deals = [...byId.values()];
  const out = { entered: 0, rules: 0, toNegative: 0 };

  for (const doc of deals) {
    const d = { id: doc.id, ...doc.data() };
    const pipeline = pipelines[d.pipelineId];
    if (!pipeline || d.status === "ganado" || d.status === "perdido") continue;
    const board = d.board || "pos";

    // 1) Entrada en etapa (reclamada antes de enviar nada: nunca se ejecuta dos veces).
    const key = `${board}:${d.stage}`;
    if (d.flowStage !== key) {
      const claimed = await claim(doc.ref, key, since);
      if (!claimed) continue;
      if (board !== "pos") { if (claimed.flow?.waiting) await doc.ref.update({ "flow.waiting": false }); continue; }
      let r = { ran: 0, waitH: 0 };
      try {
        r = await runRules(pipeline, claimed);
      } catch (e) {
        console.error("[stageflow] reglas:", d.id, e.message);
        await addActivity(d.orgId, { type: "Nota", title: `⚠ Automatización: error al ejecutar las reglas de la etapa (${String(e.message).slice(0, 120)})`, entity: "deal", entityId: d.id });
      }
      await doc.ref.update({
        flow: r.waitH ? { stage: d.stage, waiting: true, sentAt: now, dueAt: now + r.waitH * 3600e3, waitH: r.waitH } : { stage: d.stage, waiting: false },
      });
      out.entered++; out.rules += r.ran;
      continue;
    }

    // 3) Plazo vencido sin respuesta → Kanban Negativo.
    const f = d.flow;
    if (board === "pos" && f?.waiting && f.stage === d.stage && f.dueAt && now > f.dueAt) {
      const target = pickNegTarget(pipeline, d);
      // En transacción: si justo respondió o alguien la movió, no se toca.
      const moved = await db.runTransaction(async (tx) => {
        const cur = (await tx.get(doc.ref)).data();
        if (!cur?.flow?.waiting || cur.flow.stage !== cur.stage || (cur.board || "pos") !== "pos") return false;
        tx.update(doc.ref, target
          ? { board: "neg", stage: target.id, prevStage: cur.stage, flowStage: `neg:${target.id}`, flow: { ...cur.flow, waiting: false, expiredAt: now }, updatedAt: new Date() }
          : { "flow.waiting": false });
        return !!target;
      });
      if (!moved) continue;
      await addActivity(d.orgId, {
        type: "Tarea", title: `☎ Sin respuesta en ${plazoTxt(f.waitH)} · Re-contactar a ${d.contact || d.title}`,
        entity: "deal", entityId: d.id, contactId: d.contactId || "", dueDate: ymd(new Date()),
        assignee: d.responsable || "Responsable", assigneeType: "person", assigneeId: "", assigneeName: d.responsable || "", assigneeEmail: d.ownerEmail || "",
      });
      await addActivity(d.orgId, {
        type: "Nota", title: `⏰ Automatización · Sin respuesta en ${plazoTxt(f.waitH)} → Kanban Negativo · ${target.label}`,
        entity: "deal", entityId: d.id, contactId: d.contactId || "",
      });
      out.toNegative++;
    }
  }
  await orgRef.set({ flowLastRun: now }, { merge: true });
  return out;
}

module.exports = { runStageFlow, respond, interestText, matchesInterest, matchesClient };
