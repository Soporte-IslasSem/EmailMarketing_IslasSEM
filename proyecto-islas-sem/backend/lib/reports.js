// Informes de campaña (colección "reports", id = campaignId), alimentados por el backend:
// envíos (outbox), aperturas (pixel), clics (redirección) y rebotes (IMAP).
// La app los lee en Email Marketing › Informes.
const { admin, db } = require("./firebase");

const FV = admin.firestore.FieldValue;
const ref = (campaignId) => db.collection("reports").doc(campaignId);

// Las claves del mapa "subscribers" son emails; se guardan con set+merge (objeto anidado),
// así los puntos del email no se interpretan como rutas de campo.
async function ensureReport(campaignId) {
  const r = ref(campaignId);
  const snap = await r.get();
  if (snap.exists) return r;
  const c = await db.collection("campaigns").doc(campaignId).get();
  const data = c.exists ? c.data() : {};
  await r.set({
    campaignId,
    campaignName: data.config?.campaignName || data.name || "Sin nombre",
    subject: data.config?.subject || "",
    ownerId: data.ownerId || null,
    totalRecipients: data.recipientsCount || 0,
    status: "sending",
    createdAt: new Date(),
    stats: { sent: 0, failed: 0, opens: 0, clicks: 0, bounces: 0, hardBounces: 0, softBounces: 0, complaints: 0, unsubscribes: 0, replies: 0 },
  }, { merge: true });
  return r;
}

async function recordSend(campaignId, email, ok, error) {
  const r = await ensureReport(campaignId);
  await r.set({
    results: FV.arrayUnion({ email, status: ok ? "sent" : "error", ...(ok ? {} : { error: String(error || "").slice(0, 200) }) }),
    stats: { [ok ? "sent" : "failed"]: FV.increment(1) },
    subscribers: { [email]: { sent: ok, sentAt: ok ? Date.now() : null } },
    lastSentAt: new Date(),
  }, { merge: true });
}

async function recordOpen(campaignId, email) {
  if (!email) return;
  const r = await ensureReport(campaignId);
  const snap = await r.get();
  const prev = snap.data()?.subscribers?.[email] || {};
  await r.set({
    stats: { opens: FV.increment(1) },
    subscribers: { [email]: { opened: true, openedAt: prev.openedAt || Date.now(), lastOpenedAt: Date.now(), openCount: (prev.openCount || 0) + 1 } },
    lastOpened: new Date().toLocaleString("es-ES", { timeZone: "Atlantic/Canary" }),
  }, { merge: true });
}

async function recordClick(campaignId, email, url) {
  const r = await ensureReport(campaignId);
  const snap = await r.get();
  const prev = snap.data()?.subscribers?.[email] || {};
  const urls = Array.isArray(prev.clickedUrls) ? prev.clickedUrls : [];
  await r.set({
    stats: { clicks: FV.increment(1) },
    urls: { [Buffer.from(url).toString("base64url").slice(0, 300)]: { url, clicks: FV.increment(1) } },
    ...(email ? { subscribers: { [email]: {
      clicked: true, clickedAt: Date.now(), lastClickedUrl: url,
      clickCount: (prev.clickCount || 0) + 1, clickedUrls: [...urls, url].slice(-50),
      // un clic implica apertura (si el cliente bloqueó las imágenes, el pixel no cuenta)
      opened: true, openedAt: prev.openedAt || Date.now(),
    } } } : {}),
  }, { merge: true });
}

async function recordBounce(campaignId, email, hard) {
  const r = await ensureReport(campaignId);
  await r.set({
    stats: { bounces: FV.increment(1), [hard ? "hardBounces" : "softBounces"]: FV.increment(1) },
    subscribers: { [email]: { bounced: true, bounceType: hard ? "hard" : "soft", bouncedAt: Date.now() } },
  }, { merge: true });
}

// Respuesta de un destinatario (detectada por hilo en el buzón). Cuenta una por destinatario.
async function recordReply(campaignId, email) {
  if (!email) return;
  const r = await ensureReport(campaignId);
  const prev = (await r.get()).data()?.subscribers?.[email] || {};
  await r.set({
    ...(prev.replied ? {} : { stats: { replies: FV.increment(1) } }),
    subscribers: { [email]: { replied: true, repliedAt: prev.repliedAt || Date.now(), replyCount: (prev.replyCount || 0) + 1 } },
  }, { merge: true });
}

async function closeReport(campaignId) {
  const r = await ensureReport(campaignId);
  await r.set({ status: "sent", sentAt: new Date() }, { merge: true });
}

module.exports = { recordSend, recordOpen, recordClick, recordBounce, recordReply, closeReport };
