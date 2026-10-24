// WhatsApp (sección WhatsApp de la app) con la API oficial de Meta (WhatsApp Cloud API), sin
// intermediarios.
//
// - Ajustes (system/whatsappSettings): identificador del número, de la cuenta (WABA), token de
//   acceso, clave secreta de la app y token de verificación del webhook. El token y la clave
//   secreta NUNCA salen del servidor: la app solo sabe si están puestos.
// - Webhook (/api/whatsapp/webhook): Meta avisa de cada mensaje que entra y de cada cambio de
//   estado (enviado, entregado, leído, fallido). Se comprueba la firma (X-Hub-Signature-256)
//   con la clave secreta de la app; sin firma válida no se acepta nada.
// - Chats (waChats/<wa_id>): uno por número. Se liga al contacto del CRM con el mismo teléfono
//   (o a mano desde la app). Mensajes en waChats/<wa_id>/messages/<id>.
// - La app LEE chats y mensajes en tiempo real (reglas: solo empleados que pueden ver
//   contactos) pero no escribe: enviar, asignar, archivar o ligar pasa por aquí.
// - Regla de WhatsApp: solo se puede escribir texto libre si el cliente escribió en las
//   últimas 24 h. Fuera de esa ventana hacen falta plantillas aprobadas por Meta.
const crypto = require("crypto");
const { admin, db, bucket } = require("./firebase");
const { staffFromReq } = require("./access");
const { DEFAULT_ORG_ID, norm } = require("./link");

const GRAPH = (process.env.WA_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "");
const VERSION = process.env.WA_GRAPH_VERSION || "v23.0";
const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
const SETTINGS = () => db.collection("system").doc("whatsappSettings");
const CHATS = () => db.collection("waChats");
const WINDOW_MS = 24 * 3600e3;
const MAX_MEDIA = 16 * 1024 * 1024; // lo que se descarga/guarda de cada archivo
const clip = (s, n = 200) => String(s ?? "").trim().slice(0, n);
const digits = (s) => String(s || "").replace(/\D/g, "");
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
// El id de Meta (wamid.…) puede llevar caracteres que no valen como id de documento.
const msgDocId = (wamid) => crypto.createHash("sha1").update(String(wamid)).digest("hex");
const RANK = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

let cache = null; // ajustes en memoria 30 s (el webhook llega muy seguido)
async function settings(fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < 30e3) return cache.s;
  const s = (await SETTINGS().get()).data() || {};
  cache = { at: Date.now(), s };
  return s;
}

async function staff(req, res) {
  const user = await staffFromReq(req);
  if (!user) res.status(401).json({ ok: false, error: "Sesión no válida" });
  return user;
}
async function isAdmin(email) {
  const org = (await db.collection("organizations").doc(DEFAULT_ORG_ID).get()).data() || {};
  const admins = (org.adminEmails || []).map(norm);
  return !admins.length || admins.includes(norm(email));
}

/* ------------------------------------------------------------------ Graph API */

async function graph(path, { method = "GET", body, form, token } = {}) {
  const s = await settings();
  const tk = token || s.token;
  if (!tk) throw Object.assign(new Error("WhatsApp no está configurado (falta el token en Ajustes)"), { status: 409 });
  const r = await fetch(`${GRAPH}/${VERSION}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${tk}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : form,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.error) {
    const e = out.error || {};
    const err = new Error(explain(e) || `Meta respondió ${r.status}`);
    err.status = 502;
    err.meta = { code: e.code, subcode: e.error_subcode, message: e.message };
    throw err;
  }
  return out;
}
// Mensajes de error de Meta más frecuentes, en cristiano.
function explain(e) {
  const code = Number(e.code);
  if (code === 131047 || code === 470) return "Han pasado más de 24 h desde el último mensaje del cliente: hace falta una plantilla aprobada por Meta.";
  if (code === 190) return "El token de acceso de Meta no es válido o ha caducado. Cámbialo en WhatsApp › Ajustes.";
  if (code === 131026) return "Ese número no puede recibir el mensaje (no tiene WhatsApp o no acepta mensajes de empresas).";
  if (code === 131056) return "Demasiados mensajes seguidos a este número. Espera un poco.";
  if (code === 131051) return "Tipo de mensaje no admitido por WhatsApp.";
  if (code === 131052 || code === 131053) return "No se pudo procesar el archivo (formato o tamaño no admitidos por WhatsApp).";
  if (code === 100) return `Petición rechazada por Meta: ${e.error_data?.details || e.message || "parámetro no válido"}`;
  return e.error_data?.details || e.message || "";
}

/* ------------------------------------------------------------------ contactos */

// Contacto del CRM con ese número (compara los últimos 9 dígitos de teléfono y WhatsApp).
async function findContact(waId) {
  const key = digits(waId).slice(-9);
  if (key.length < 9) return null;
  const snap = await db.collection("contacts").where("orgId", "==", DEFAULT_ORG_ID).select("phone", "whatsapp", "firstName", "lastName", "deleted").get();
  const hit = snap.docs.find((d) => {
    const c = d.data();
    return !c.deleted && [c.phone, c.whatsapp].some((p) => digits(p).length >= 9 && digits(p).slice(-9) === key);
  });
  if (!hit) return null;
  const c = hit.data();
  return { id: hit.id, name: `${c.firstName || ""} ${c.lastName || ""}`.trim() };
}

/* ------------------------------------------------------------------ webhook */

function verifyWebhook(req, res) {
  settings(true).then((s) => {
    const ok = req.query["hub.mode"] === "subscribe" && s.verifyToken && req.query["hub.verify_token"] === s.verifyToken;
    if (!ok) return res.sendStatus(403);
    res.type("text/plain").send(String(req.query["hub.challenge"] || ""));
  }).catch(() => res.sendStatus(500));
}

async function receiveWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const s = await settings();
  const sig = String(req.headers["x-hub-signature-256"] || "");
  const expected = s.appSecret ? "sha256=" + crypto.createHmac("sha256", s.appSecret).update(raw).digest("hex") : "";
  const valid = expected && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!valid) return res.sendStatus(401);
  let payload;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return res.sendStatus(400); }
  // Meta reintenta si no respondemos rápido: se contesta ya y se procesa después.
  res.sendStatus(200);
  try {
    await processPayload(payload, s);
  } catch (e) {
    console.error("[whatsapp] webhook:", e.message || e);
  }
}

async function processPayload(payload, s) {
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      if (change.field !== "messages" || !v.metadata) continue;
      if (s.phoneNumberId && String(v.metadata.phone_number_id) !== String(s.phoneNumberId)) continue;
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || ""]));
      for (const m of v.messages || []) await inbound(m, names[m.from] || "").catch((e) => console.error("[whatsapp] mensaje:", e.message || e));
      for (const st of v.statuses || []) await statusUpdate(st).catch((e) => console.error("[whatsapp] estado:", e.message || e));
    }
  }
}

// Texto de un mensaje entrante y su archivo (si lo trae).
function parseInbound(m) {
  const t = m.type;
  const media = ["image", "document", "audio", "video", "sticker"].includes(t) ? m[t] : null;
  let text = "";
  if (t === "text") text = m.text?.body || "";
  else if (media) text = media.caption || "";
  else if (t === "location") text = `📍 ${[m.location?.name, m.location?.address].filter(Boolean).join(" · ") || "Ubicación"} (${m.location?.latitude}, ${m.location?.longitude})`;
  else if (t === "contacts") text = `👤 ${(m.contacts || []).map((c) => [c.name?.formatted_name, ...(c.phones || []).map((p) => p.phone)].filter(Boolean).join(" ")).join(" · ")}`;
  else if (t === "interactive") text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
  else if (t === "button") text = m.button?.text || "";
  else if (t === "reaction") text = m.reaction?.emoji ? `Reaccionó ${m.reaction.emoji}` : "Quitó una reacción";
  else text = "(Mensaje no admitido por WhatsApp)";
  return {
    type: t, text: clip(text, 4096),
    media: media ? { id: media.id, mime: media.mime_type || "", filename: clip(media.filename, 200), voice: !!media.voice } : null,
  };
}

const PREVIEW = { image: "📷 Foto", document: "📄 Documento", audio: "🎤 Audio", video: "🎬 Vídeo", sticker: "Sticker" };
const preview = (type, text, filename) => clip(text || (type === "document" && filename ? `📄 ${filename}` : PREVIEW[type]) || "", 120);

async function inbound(m, profileName) {
  const waId = digits(m.from);
  if (!waId) return;
  const id = msgDocId(m.id);
  const chatRef = CHATS().doc(waId);
  const msgRef = chatRef.collection("messages").doc(id);
  const p = parseInbound(m);
  const at = Number(m.timestamp) * 1000 || Date.now();
  // create() falla si ya existe: Meta puede repetir el aviso y así no se duplica.
  try {
    await msgRef.create({
      orgId: DEFAULT_ORG_ID, chatId: waId, wamid: m.id, dir: "in", type: p.type, text: p.text,
      media: p.media ? { ...p.media, path: "", pending: true } : null,
      replyTo: m.context?.id ? msgDocId(m.context.id) : "", at, createdAt: Date.now(),
    });
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message)) return;
    throw e;
  }
  const chat = (await chatRef.get()).data();
  const patch = {
    orgId: DEFAULT_ORG_ID, waId, phone: `+${waId}`, profileName: clip(profileName, 120) || chat?.profileName || "",
    lastText: preview(p.type, p.text, p.media?.filename), lastDir: "in", lastAt: at, lastInboundAt: at,
    // Incremento atómico: dos mensajes que llegan a la vez cuentan los dos.
    unread: admin.firestore.FieldValue.increment(1), archived: false, updatedAt: Date.now(),
  };
  if (!chat) {
    const c = await findContact(waId);
    Object.assign(patch, { contactId: c?.id || "", contactName: c?.name || "", assigneeEmail: "", assigneeName: "", createdAt: Date.now() });
  }
  await chatRef.set(patch, { merge: true });
  if (p.media) await saveInboundMedia(chatRef, msgRef, waId, id, p.media).catch(async (e) => {
    console.error("[whatsapp] archivo:", e.message || e);
    await msgRef.update({ "media.pending": false, "media.error": clip(e.message, 200) }).catch(() => {});
  });
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf" };
const extOf = (mime, filename) => (/\.([A-Za-z0-9]{1,6})$/.exec(filename || "")?.[1] || EXT[String(mime).split(";")[0]] || "bin").toLowerCase();

// Meta guarda los archivos poco tiempo: se descargan enseguida a nuestro Storage.
async function saveInboundMedia(chatRef, msgRef, waId, id, media) {
  const info = await graph(media.id);
  if (Number(info.file_size) > MAX_MEDIA) {
    await msgRef.update({ "media.pending": false, "media.error": "Archivo demasiado grande para guardarlo (más de 16 MB)", "media.size": Number(info.file_size) });
    return;
  }
  const s = await settings();
  const r = await fetch(info.url, { headers: { Authorization: `Bearer ${s.token}` } });
  if (!r.ok) throw new Error(`Descarga del archivo: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const mime = info.mime_type || media.mime || "application/octet-stream";
  const path = `whatsapp/${DEFAULT_ORG_ID}/${waId}/${id}.${extOf(mime, media.filename)}`;
  await bucket().file(path).save(buf, { contentType: mime, resumable: false });
  await msgRef.update({ "media.path": path, "media.pending": false, "media.size": buf.length, "media.mime": mime });
}

async function statusUpdate(st) {
  const waId = digits(st.recipient_id);
  if (!waId || !st.id) return;
  const ref = CHATS().doc(waId).collection("messages").doc(msgDocId(st.id));
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data();
    if (!cur) return; // mensaje enviado desde otro sitio (p. ej. el móvil): no lo tenemos
    if ((RANK[st.status] ?? -1) <= (RANK[cur.status] ?? -1) && st.status !== "failed") return;
    const patch = { status: st.status, [`statusAt.${st.status}`]: Number(st.timestamp) * 1000 || Date.now() };
    if (st.status === "failed") patch.error = clip(explain(st.errors?.[0] || {}) || st.errors?.[0]?.title || "No se pudo entregar", 300);
    tx.update(ref, patch);
  });
}

/* ------------------------------------------------------------------ enviar */

async function openChat(chatId) {
  const waId = digits(chatId);
  const ref = CHATS().doc(waId || "x");
  const chat = (await ref.get()).data();
  if (!chat) throw Object.assign(new Error("Ese chat no existe"), { status: 404 });
  if (!chat.lastInboundAt || Date.now() - chat.lastInboundAt > WINDOW_MS) {
    throw Object.assign(new Error("Han pasado más de 24 h desde el último mensaje del cliente. WhatsApp solo permite escribirle con una plantilla aprobada por Meta."), { status: 409 });
  }
  return { waId, ref, chat };
}

// Guarda el mensaje saliente y actualiza el chat.
async function storeOutbound({ ref, waId }, wamid, data, user) {
  const id = msgDocId(wamid);
  const at = Date.now();
  await ref.collection("messages").doc(id).set({
    orgId: DEFAULT_ORG_ID, chatId: waId, wamid, dir: "out", status: "pending", at, createdAt: at,
    byEmail: norm(user.email), byName: clip(user.name || user.email, 120), ...data,
  });
  await ref.set({ lastText: preview(data.type, data.text, data.media?.filename), lastDir: "out", lastAt: at, unread: 0, updatedAt: at }, { merge: true });
  return id;
}

async function send(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const text = String(req.body?.text || "").trim().slice(0, 4096);
  if (!text) return fail(res, "Escribe un mensaje");
  const c = await openChat(req.body?.chatId);
  const s = await settings();
  const replyTo = clip(req.body?.replyToWamid, 300);
  const out = await graph(`${s.phoneNumberId}/messages`, {
    method: "POST",
    body: { messaging_product: "whatsapp", recipient_type: "individual", to: c.waId, type: "text", text: { body: text, preview_url: /https?:\/\//.test(text) }, ...(replyTo ? { context: { message_id: replyTo } } : {}) },
  });
  const id = await storeOutbound(c, out.messages?.[0]?.id || `local-${Date.now()}`, { type: "text", text, replyTo: replyTo ? msgDocId(replyTo) : "" }, user);
  res.json({ ok: true, id });
}

const KIND_OF = (mime) => (/^image\/(jpeg|png)$/.test(mime) ? "image" : /^video\/(mp4|3gpp)$/.test(mime) ? "video" : /^audio\//.test(mime) ? "audio" : "document");

async function sendMedia(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const b = req.body || {};
  const buf = Buffer.from(String(b.data || ""), "base64");
  if (!buf.length) return fail(res, "Falta el archivo");
  if (buf.length > MAX_MEDIA) return fail(res, "El archivo pasa de 16 MB", 413);
  const mime = clip(b.mime, 100) || "application/octet-stream";
  const filename = clip(b.name, 200).replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").trim() || "archivo";
  const caption = String(b.caption || "").trim().slice(0, 1024);
  const c = await openChat(b.chatId);
  const s = await settings();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([buf], { type: mime }), filename);
  const up = await graph(`${s.phoneNumberId}/media`, { method: "POST", form });
  const type = KIND_OF(mime);
  const payload = { id: up.id, ...(type !== "audio" && caption ? { caption } : {}), ...(type === "document" ? { filename } : {}) };
  const out = await graph(`${s.phoneNumberId}/messages`, {
    method: "POST", body: { messaging_product: "whatsapp", recipient_type: "individual", to: c.waId, type, [type]: payload },
  });
  const wamid = out.messages?.[0]?.id || `local-${Date.now()}`;
  const path = `whatsapp/${DEFAULT_ORG_ID}/${c.waId}/${msgDocId(wamid)}.${extOf(mime, filename)}`;
  await bucket().file(path).save(buf, { contentType: mime, resumable: false });
  const id = await storeOutbound(c, wamid, { type, text: type !== "audio" ? caption : "", media: { mime, filename, path, size: buf.length } }, user);
  res.json({ ok: true, id });
}

/* ------------------------------------------------------------------ gestión de chats */

async function fileUrl(req, res) {
  if (!(await staff(req, res))) return;
  const ref = CHATS().doc(digits(req.body?.chatId) || "x").collection("messages").doc(clip(req.body?.id, 80) || "x");
  const m = (await ref.get()).data();
  if (!m?.media?.path) return fail(res, "Ese archivo no está disponible", 404);
  const [url] = await bucket().file(m.media.path).getSignedUrl({ action: "read", expires: Date.now() + 60 * 60e3 });
  res.json({ ok: true, url });
}

// Marcar leído, asignar, archivar o ligar a un contacto del CRM.
async function updateChat(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const b = req.body || {};
  const ref = CHATS().doc(digits(b.chatId) || "x");
  if (!(await ref.get()).exists) return fail(res, "Ese chat no existe", 404);
  const patch = {};
  if (b.read) patch.unread = 0;
  if (typeof b.archived === "boolean") patch.archived = b.archived;
  if ("assigneeEmail" in b) { patch.assigneeEmail = norm(b.assigneeEmail).slice(0, 150); patch.assigneeName = clip(b.assigneeName, 120); }
  if ("contactId" in b) {
    const cid = clip(b.contactId, 80);
    if (cid) {
      const c = (await db.collection("contacts").doc(cid).get()).data();
      if (!c || c.orgId !== DEFAULT_ORG_ID) return fail(res, "Ese contacto no existe", 404);
      Object.assign(patch, { contactId: cid, contactName: `${c.firstName || ""} ${c.lastName || ""}`.trim() });
    } else Object.assign(patch, { contactId: "", contactName: "" });
  }
  if (!Object.keys(patch).length) return res.json({ ok: true });
  await ref.update(patch);
  res.json({ ok: true });
}

/* ------------------------------------------------------------------ ajustes */

async function getSettings(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const s = await settings(true);
  res.json({
    ok: true, admin: await isAdmin(user.email),
    settings: {
      phoneNumberId: s.phoneNumberId || "", wabaId: s.wabaId || "", verifyToken: s.verifyToken || "",
      displayPhone: s.displayPhone || "", verifiedName: s.verifiedName || "", quality: s.quality || "",
      hasToken: !!s.token, hasAppSecret: !!s.appSecret, checkedAt: s.checkedAt || 0,
      webhookUrl: `${PUBLIC_URL}/api/whatsapp/webhook`,
    },
  });
}

async function saveSettings(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  if (!(await isAdmin(user.email))) return fail(res, "Solo un administrador puede cambiar la conexión de WhatsApp", 403);
  const b = req.body || {};
  const cur = await settings(true);
  const next = {
    phoneNumberId: digits(b.phoneNumberId).slice(0, 30), wabaId: digits(b.wabaId).slice(0, 30),
    verifyToken: clip(b.verifyToken, 100) || cur.verifyToken || crypto.randomBytes(16).toString("hex"),
    token: String(b.token || "").trim() || cur.token || "", appSecret: String(b.appSecret || "").trim() || cur.appSecret || "",
  };
  if (!next.phoneNumberId) return fail(res, "Falta el identificador del número de teléfono");
  if (!next.token) return fail(res, "Falta el token de acceso");
  // Se comprueba con Meta antes de guardar: así no se queda guardado algo que no funciona.
  let info;
  try {
    info = await graph(`${next.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { token: next.token });
  } catch (e) {
    return fail(res, `Meta no acepta estos datos: ${e.message}`, 400);
  }
  await SETTINGS().set({
    ...next, displayPhone: clip(info.display_phone_number, 40), verifiedName: clip(info.verified_name, 120),
    quality: clip(info.quality_rating, 20), checkedAt: Date.now(), updatedAt: Date.now(), updatedBy: norm(user.email),
  }, { merge: true });
  cache = null;
  res.json({ ok: true });
}

// Envuelve cada ruta: los errores con status (409, 502…) llegan a la app con su mensaje.
const route = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (e.status && !res.headersSent) return fail(res, e.message, e.status);
  console.error(`[whatsapp] ${req.method} ${req.path}:`, e.message || e);
  if (!res.headersSent) fail(res, "Error interno", 500);
});

module.exports = {
  verifyWebhook, receiveWebhook: route(receiveWebhook), send: route(send), sendMedia: route(sendMedia),
  fileUrl: route(fileUrl), updateChat: route(updateChat), getSettings: route(getSettings), saveSettings: route(saveSettings),
  // para las pruebas
  processPayload, parseInbound, msgDocId,
};
