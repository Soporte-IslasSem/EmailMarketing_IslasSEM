// Webhooks de lista (Listas › Herramientas › Webhooks): avisan a otro sistema cuando
// alguien se suscribe, se da de baja o rebota.
//
// lists/{id}.webhook = { url, secret, active, events: { subscribe, unsubscribe, bounce },
//                        lastStatus, lastAt, lastError }
// Cada envío es un POST JSON firmado: cabecera X-IslasSEM-Signature: sha256=<HMAC(secret, cuerpo)>.
// Solo se envía a URLs https públicas (nunca a IPs privadas/locales del servidor: SSRF).
const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const { admin, db } = require("./firebase");

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") ||
    (v.startsWith("::ffff:") && isPrivateIp(v.slice(7)));
}

async function assertSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("URL no válida"); }
  if (u.protocol !== "https:") throw new Error("La URL debe empezar por https://");
  if (u.username || u.password) throw new Error("La URL no puede llevar usuario/contraseña");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error("La URL apunta a una dirección no permitida");
  return u.toString();
}

async function post(hook, event, data) {
  const url = await assertSafeUrl(hook.url);
  const body = JSON.stringify({ event, sentAt: new Date().toISOString(), data });
  const sig = crypto.createHmac("sha256", hook.secret || "").update(body).digest("hex");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      method: "POST", redirect: "manual", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "User-Agent": "IslasSEM-Webhooks/1.0", "X-IslasSEM-Event": event, "X-IslasSEM-Signature": `sha256=${sig}` },
      body,
    });
    return r.status;
  } finally {
    clearTimeout(t);
  }
}

// Dispara el webhook de la lista si está activo para ese evento. Nunca lanza.
async function fireWebhook(listId, event, data) {
  try {
    const ref = db.collection("lists").doc(listId);
    const snap = await ref.get();
    const hook = snap.exists ? snap.data().webhook : null;
    if (!hook?.active || !hook.url || !hook.events?.[event]) return;
    let status = 0, error = "";
    try { status = await post(hook, event, { listId, listName: snap.data().name || "", ...data }); }
    catch (e) { error = e.name === "AbortError" ? "Tiempo de espera agotado" : e.message; }
    await ref.update({
      "webhook.lastAt": Date.now(), "webhook.lastStatus": status, "webhook.lastError": error || admin.firestore.FieldValue.delete(),
      "webhook.lastEvent": event,
    });
  } catch (e) {
    console.warn("[webhook]", listId, event, e.message);
  }
}

// POST /api/lists/:id/webhook-test  (Authorization: Bearer <idToken>) — solo el dueño de la lista
async function testWebhook(req, res) {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Sin sesión" });
    const user = await admin.auth().verifyIdToken(token).catch(() => null);
    if (!user) return res.status(401).json({ error: "Sesión no válida" });
    const snap = await db.collection("lists").doc(String(req.params.id).slice(0, 64)).get();
    if (!snap.exists || snap.data().userId !== user.uid) return res.status(404).json({ error: "Lista no encontrada" });
    const hook = { ...(snap.data().webhook || {}), ...(req.body?.url ? { url: String(req.body.url) } : {}), ...(req.body?.secret ? { secret: String(req.body.secret) } : {}) };
    if (!hook.url) return res.status(400).json({ error: "Falta la URL" });
    const status = await post(hook, "test", { listId: snap.id, listName: snap.data().name || "", email: "prueba@ejemplo.com", message: "Webhook de prueba de ISLAS SEM" });
    res.json({ ok: status >= 200 && status < 300, status });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.name === "AbortError" ? "Tiempo de espera agotado" : e.message });
  }
}

module.exports = { fireWebhook, testWebhook, assertSafeUrl, isPrivateIp };
