// Suscripciones de Email Marketing: alta desde formularios incrustados (con doble opt-in
// opcional), confirmación y baja en dos pasos, usando los ajustes de
// Listas › Notificaciones (confirmEmail, confirmPage, unsubscribePage, general).
const crypto = require("crypto");
const { admin, db } = require("./firebase");
const { confirmEmailHtml, confirmPageHtml, unsubscribePageHtml, page, esc } = require("./notificationHtml");
const { fireWebhook } = require("./webhooks");

const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
const API = `${PUBLIC_URL}/api`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const FV = admin.firestore.FieldValue;

async function listSettings(listId) {
  const col = db.collection("lists").doc(listId).collection("notifications");
  const [general, confirmEmail, confirmPage, unsubscribePage] = await Promise.all(
    ["general", "confirmEmail", "confirmPage", "unsubscribePage"].map((id) => col.doc(id).get().then((d) => (d.exists ? d.data() : {})).catch(() => ({})))
  );
  return { general, confirmEmail, confirmPage, unsubscribePage };
}

// Aviso al dueño de la lista (Notificaciones › General).
async function notifyOwner(list, subject, text) {
  if (!list?.userId) return;
  const u = await db.collection("users").doc(list.userId).get().catch(() => null);
  const to = u?.exists ? u.data().email : "";
  if (!to) return;
  await db.collection("outbox").add({
    orgId: "islas-sem", to, subject, html: `<p style="font-family:Arial">${esc(text)}</p>`,
    kind: "notification", status: "pending", attempts: 0, error: "", sentAt: null, createdAt: new Date(),
  });
}

// Límite simple por IP para el endpoint público (evita altas masivas automatizadas).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60e3);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 10;
}

// POST /api/forms/subscribe  { formId, email }   (CORS abierto: se usa en webs externas)
async function subscribe(req, res) {
  try {
    if (rateLimited(req.ip)) return res.status(429).json({ error: "Demasiados intentos, espera un minuto." });
    const formId = String(req.body?.formId || "").slice(0, 64);
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 200);
    if (!formId || !email) return res.status(400).json({ error: "Faltan datos" });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Email no válido" });
    const formSnap = await db.collection("forms").doc(formId).get();
    if (!formSnap.exists) return res.status(404).json({ error: "Formulario no encontrado" });
    const form = formSnap.data();
    const listRef = db.collection("lists").doc(form.listId);
    const list = (await listRef.get()).data();
    if (!list) return res.status(404).json({ error: "Lista no encontrada" });
    const s = await listSettings(form.listId);
    const doubleOptIn = !!s.confirmEmail.enabled;

    const existing = await db.collection("subscribers").where("email", "==", email).where("listId", "==", form.listId).limit(1).get();
    let subRef = existing.empty ? null : existing.docs[0].ref;
    const prev = existing.empty ? null : existing.docs[0].data();
    if (prev?.status === "subscribed") return res.json({ success: true });

    const token = crypto.randomBytes(16).toString("hex");
    const status = doubleOptIn ? "pending" : "subscribed";
    if (subRef) {
      await subRef.update({ status, confirmToken: doubleOptIn ? token : FV.delete(), resubscribedAt: Date.now(), ...(doubleOptIn ? {} : { confirmedAt: Date.now() }) });
    } else {
      subRef = await db.collection("subscribers").add({
        email, listId: form.listId, userId: form.userId || list.userId, status, source: "form", formId,
        createdAt: new Date(), ...(doubleOptIn ? { confirmToken: token } : { confirmedAt: Date.now() }),
      });
      await listRef.update({ subscribersCount: FV.increment(1) });
    }

    if (doubleOptIn) {
      const url = `${API}/forms/confirm/${subRef.id}?t=${token}`;
      await db.collection("outbox").add({
        orgId: "islas-sem", to: email, subject: s.confirmEmail.subject || "Confirma tu suscripción",
        html: confirmEmailHtml(s.general, s.confirmEmail, url), kind: "confirm", subscriberId: subRef.id,
        status: "pending", attempts: 0, error: "", sentAt: null, createdAt: new Date(),
      });
      return res.json({ success: true, pending: true, message: "Revisa tu correo y confirma la suscripción." });
    }
    if (s.general.notifyOnSubscribe) await notifyOwner(list, `Nuevo suscriptor en "${list.name}"`, `${email} se ha suscrito a la lista "${list.name}".`);
    res.json({ success: true });
    fireWebhook(form.listId, "subscribe", { email, subscriberId: subRef.id, source: "form", formId });
  } catch (e) {
    console.error("[forms/subscribe]", e);
    res.status(500).json({ error: "Error interno" });
  }
}

// GET /api/forms/confirm/:sid?t=token — doble opt-in
async function confirm(req, res) {
  const html = (t, b) => res.set("Content-Type", "text/html; charset=utf-8").send(page(t, b));
  try {
    const ref = db.collection("subscribers").doc(String(req.params.sid).slice(0, 64));
    const snap = await ref.get();
    if (!snap.exists) return html("Enlace no válido", "<p style='font-family:Arial;text-align:center;margin:60px'>El enlace no es válido o ha caducado.</p>");
    const sub = snap.data();
    const s = await listSettings(sub.listId);
    const valid = sub.status === "subscribed" || (sub.confirmToken && sub.confirmToken === String(req.query.t || ""));
    if (!valid) return html("Enlace no válido", "<p style='font-family:Arial;text-align:center;margin:60px'>El enlace no es válido o ha caducado.</p>");
    if (sub.status !== "subscribed") {
      await ref.update({ status: "subscribed", confirmedAt: Date.now(), confirmToken: FV.delete() });
      fireWebhook(sub.listId, "subscribe", { email: sub.email, subscriberId: ref.id, source: "form", confirmed: true });
      if (s.general.notifyOnSubscribe) {
        const list = (await db.collection("lists").doc(sub.listId).get()).data();
        await notifyOwner(list, `Nuevo suscriptor en "${list?.name}"`, `${sub.email} ha confirmado su suscripción a "${list?.name}".`);
      }
    }
    if (s.confirmPage.mode === "link" && /^https?:\/\//i.test(s.confirmPage.link || "")) return res.redirect(302, s.confirmPage.link);
    return html("Suscripción confirmada", confirmPageHtml(s.general, s.confirmPage));
  } catch (e) {
    console.error("[forms/confirm]", e);
    html("Error", "<p style='font-family:Arial;text-align:center;margin:60px'>No se pudo confirmar. Inténtalo más tarde.</p>");
  }
}

// GET /api/u/:sid → página de baja (no da de baja: los antivirus abren los enlaces).
// POST /api/u/:sid → baja (formulario de la página o "List-Unsubscribe=One-Click" de Gmail).
async function unsubscribePage(req, res, done) {
  const sid = String(req.params.subscriberId).slice(0, 64);
  const snap = await db.collection("subscribers").doc(sid).get().catch(() => null);
  const sub = snap?.exists ? snap.data() : null;
  const s = sub ? await listSettings(sub.listId) : { general: {}, unsubscribePage: {} };
  const body = unsubscribePageHtml(s.general, s.unsubscribePage, `${API}/u/${encodeURIComponent(sid)}`, done || sub?.status === "unsubscribed");
  res.set("Content-Type", "text/html; charset=utf-8").send(page("Baja de la lista", body));
}

async function doUnsubscribe(req, res) {
  const sid = String(req.params.subscriberId).slice(0, 64);
  try {
    const ref = db.collection("subscribers").doc(sid);
    const snap = await ref.get();
    if (snap.exists && snap.data().status !== "unsubscribed") {
      const reason = String(req.body?.reason || "").slice(0, 120);
      const oneClick = String(req.body?.["List-Unsubscribe"] || "") === "One-Click";
      await ref.update({ status: "unsubscribed", unsubscribedAt: Date.now(), ...(reason ? { unsubscribeReason: reason } : {}), ...(oneClick ? { unsubscribeVia: "one-click" } : {}) });
      const sub = snap.data();
      fireWebhook(sub.listId, "unsubscribe", { email: sub.email, subscriberId: sid, reason: reason || null, oneClick });
      const s = await listSettings(sub.listId);
      if (s.general.notifyOnUnsubscribe) {
        const list = (await db.collection("lists").doc(sub.listId).get()).data();
        await notifyOwner(list, `Baja en "${list?.name}"`, `${sub.email} se ha dado de baja de "${list?.name}".${reason ? ` Motivo: ${reason}` : ""}`);
      }
    }
  } catch (e) { console.warn("[unsubscribe]", e.message); }
  if (req.is("application/x-www-form-urlencoded") && String(req.body?.["List-Unsubscribe"] || "") === "One-Click") return res.sendStatus(200);
  return unsubscribePage(req, res, true);
}

module.exports = { subscribe, confirm, unsubscribePage, doUnsubscribe };
