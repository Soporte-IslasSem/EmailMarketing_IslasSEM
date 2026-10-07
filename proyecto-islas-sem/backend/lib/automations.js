// Automatizaciones de Email Marketing (autorespuestas / secuencias).
//
// automations/{id}: { userId, name, active, trigger: { type: "list_subscribe", listId },
//   steps: [{ delayValue, delayUnit: "minutes"|"hours"|"days", subject, templateId?, html? }],
//   activatedAt (ms), cursor (ms), stats: { enrolled, sent } }
// automationEnrollments/{automationId}_{subscriberId}: { automationId, subscriberId, email,
//   step, nextAt (ms), done }
//
// Solo se inscriben suscriptores que entran en la lista DESPUÉS de activar la automatización
// (no se dispara contra toda la lista existente). Los correos van a la misma cola (outbox).
const { admin, db } = require("./firebase");

const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
const API = `${PUBLIC_URL}/api`;
const UNIT_MS = { minutes: 60e3, hours: 3600e3, days: 86400e3 };
const delayMs = (step) => Math.max(0, Number(step?.delayValue) || 0) * (UNIT_MS[step?.delayUnit] || UNIT_MS.days);
const toMs = (ts) => (ts?.toMillis ? ts.toMillis() : typeof ts === "number" ? ts : ts?._seconds ? ts._seconds * 1000 : 0);

const absolutize = (html) => String(html || "").replace(/\b(src|href)=(["'])\/(?!\/)/gi, `$1=$2${PUBLIC_URL}/`);

function personalize(html, sub) {
  const out = absolutize(html)
    .replace(/{{\s*(nombre|name)\s*}}/gi, sub.name || sub.firstName || "")
    .replace(/{{\s*email\s*}}/gi, sub.email || "");
  return out + `<div style="text-align:center;font-size:11px;color:#9aa8a8;margin-top:24px">
    ISLAS SEM SLU · Si no deseas recibir más correos, <a href="${API}/u/${sub.id}" style="color:#9aa8a8">date de baja aquí</a>.
  </div>`;
}

async function stepHtml(step) {
  if (step.templateId) {
    const t = await db.collection("templates").doc(step.templateId).get().catch(() => null);
    if (t && t.exists && t.data().html) return t.data().html;
  }
  return step.html || "";
}

const emailable = (s) => !!s.email && !["unsubscribed", "baja", "bounced", "rebotado", "blocked", "invalid"].includes(String(s.status || "").toLowerCase());

// 1) Inscribe a los suscriptores nuevos de la lista disparadora.
async function enrollNew(auto) {
  const listId = auto.trigger?.listId;
  if (!listId || !auto.steps?.length) return 0;
  const since = auto.cursor || auto.activatedAt || toMs(auto.createdAt) || Date.now();
  const snap = await db.collection("subscribers").where("listId", "==", listId).get();
  const fresh = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => (!auto.userId || s.userId === auto.userId) && toMs(s.createdAt) > since && emailable(s))
    .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))
    .slice(0, 200);
  let cursor = since, enrolled = 0;
  for (const s of fresh) {
    const ref = db.collection("automationEnrollments").doc(`${auto.id}_${s.id}`);
    const exists = await ref.get();
    if (!exists.exists) {
      await ref.set({
        automationId: auto.id, subscriberId: s.id, email: s.email, step: 0,
        nextAt: toMs(s.createdAt) + delayMs(auto.steps[0]), done: false, createdAt: Date.now(),
      });
      enrolled++;
    }
    cursor = Math.max(cursor, toMs(s.createdAt));
  }
  if (fresh.length) {
    await db.collection("automations").doc(auto.id).update({
      cursor, "stats.enrolled": admin.firestore.FieldValue.increment(enrolled),
    });
  }
  return enrolled;
}

// 2) Envía los pasos que ya tocan.
async function sendDue(autosById) {
  const now = Date.now();
  const snap = await db.collection("automationEnrollments").where("done", "==", false).limit(500).get();
  const due = snap.docs.filter((d) => (d.data().nextAt || 0) <= now).slice(0, 100);
  let sent = 0;
  for (const d of due) {
    const e = d.data();
    const auto = autosById[e.automationId];
    if (!auto) continue; // automatización pausada o borrada: queda en espera
    const step = auto.steps?.[e.step];
    if (!step) { await d.ref.update({ done: true }); continue; }
    const subSnap = await db.collection("subscribers").doc(e.subscriberId).get();
    const sub = subSnap.exists ? { id: subSnap.id, ...subSnap.data() } : null;
    if (!sub || !emailable(sub)) { await d.ref.update({ done: true, stoppedReason: "baja/rebote" }); continue; }
    const html = await stepHtml(step);
    await db.collection("outbox").add({
      orgId: "islas-sem", to: sub.email, toName: sub.name || "", subject: step.subject || "(sin asunto)",
      html: personalize(html, sub), kind: "automation", automationId: auto.id, step: e.step,
      subscriberId: sub.id, unsubscribeUrl: `${API}/u/${sub.id}`,
      status: "pending", attempts: 0, error: "", sentAt: null, createdAt: new Date(),
    });
    const next = auto.steps[e.step + 1];
    await d.ref.update(next
      ? { step: e.step + 1, nextAt: now + delayMs(next), lastSentAt: now }
      : { step: e.step + 1, done: true, lastSentAt: now });
    await db.collection("automations").doc(auto.id).update({ "stats.sent": admin.firestore.FieldValue.increment(1) });
    sent++;
  }
  return sent;
}

async function processAutomations() {
  const snap = await db.collection("automations").where("active", "==", true).get();
  const autos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!autos.length) return { active: 0 };
  let enrolled = 0;
  for (const a of autos) {
    try { enrolled += await enrollNew(a); } catch (e) { console.warn("[automations] inscribir", a.id, e.message); }
  }
  const sent = await sendDue(Object.fromEntries(autos.map((a) => [a.id, a])));
  return { active: autos.length, enrolled, queued: sent };
}

module.exports = { processAutomations, delayMs, personalize };
