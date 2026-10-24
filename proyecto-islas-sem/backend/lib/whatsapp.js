// WhatsApp (sección WhatsApp de la app) con la API oficial de Meta (WhatsApp Cloud API), sin
// intermediarios.
//
// - Ajustes (system/whatsappSettings): identificador del número, de la cuenta (WABA), token de
//   acceso, clave secreta de la app y token de verificación del webhook. El token y la clave
//   secreta NUNCA salen del servidor: la app solo sabe si están puestos.
// - Webhook (/api/whatsapp/webhook): Meta avisa de cada mensaje que entra, de cada cambio de
//   estado (enviado, entregado, leído, fallido) y de las revisiones de plantillas. Se
//   comprueba la firma (X-Hub-Signature-256) con la clave secreta; sin firma válida, nada.
// - Chats (waChats/<wa_id>): uno por número. Se liga al contacto del CRM con el mismo teléfono
//   (o a mano desde la app). Mensajes en waChats/<wa_id>/messages/<id>. Cada chat está en una
//   columna de un embudo (funnelId/stageId), con equipo, agente, etiquetas y notas.
// - La app LEE chats y mensajes en tiempo real (reglas: solo empleados que pueden ver
//   contactos) pero no escribe: enviar, asignar, mover, archivar o ligar pasa por aquí.
// - Regla de WhatsApp: solo se puede escribir texto libre si el cliente escribió en las
//   últimas 24 h. Fuera de esa ventana hacen falta plantillas aprobadas (waTemplates.js).
// - Lo automático (embudo de entrada, asignación, bienvenida, fuera de horario, chatbot,
//   mensaje de cierre) está en waAuto.js.
const crypto = require("crypto");
const { admin, db, bucket } = require("./firebase");
const { staffFromReq } = require("./access");
const { DEFAULT_ORG_ID, norm } = require("./link");
const cfgLib = require("./waConfig");

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
const httpError = (msg, status) => Object.assign(new Error(msg), { status });
// El id de Meta (wamid.…) puede llevar caracteres que no valen como id de documento.
const msgDocId = (wamid) => crypto.createHash("sha1").update(String(wamid)).digest("hex");
const RANK = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
const auto = () => require("./waAuto"); // (perezoso: waAuto usa este módulo)

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

// Número en formato de WhatsApp (solo dígitos, con prefijo de país). Los de 9 cifras sin
// prefijo se toman como del país por defecto (España, 34).
function toWaId(phone, cc = "34") {
  const raw = String(phone || "").trim();
  let d = digits(raw);
  if (raw.startsWith("00")) d = d.slice(2);
  else if (!raw.startsWith("+") && d.length === 9) d = cc + d;
  return d.length >= 10 && d.length <= 15 ? d : "";
}

/* ------------------------------------------------------------------ Graph API */

async function graph(path, { method = "GET", body, form, token } = {}) {
  const s = await settings();
  const tk = token || s.token;
  if (!tk) throw httpError("WhatsApp no está configurado (falta el token en Ajustes)", 409);
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
  if (code === 131049) return "Meta no ha entregado este mensaje de marketing para cuidar la experiencia del usuario (límite de mensajes de marketing por persona). Prueba más adelante.";
  if (code === 131050) return "El cliente ha pedido no recibir mensajes de marketing de esta empresa.";
  if (code === 132000) return "El número de variables no coincide con el de la plantilla.";
  if (code === 132001) return "Esa plantilla no existe en ese idioma o aún no está aprobada.";
  if (code === 132015 || code === 132016) return "Esa plantilla está pausada o desactivada por Meta por su baja calidad.";
  if (code === 131031) return "La cuenta de WhatsApp Business está bloqueada o restringida por Meta.";
  if (code === 368) return "Meta ha restringido temporalmente esta cuenta por incumplir sus políticas.";
  if (code === 100) return `Petición rechazada por Meta: ${e.error_data?.details || e.error_user_msg || e.message || "parámetro no válido"}`;
  return e.error_user_msg || e.error_data?.details || e.message || "";
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
      if (change.field === "message_template_status_update" || change.field === "message_template_quality_update") {
        await require("./waTemplates").templateEvent(change.field, v).catch((e) => console.error("[whatsapp] plantilla:", e.message || e));
        continue;
      }
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
  else if (t === "interactive") text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || (m.interactive?.nfm_reply ? "📝 Formulario enviado" : "");
  else if (t === "button") text = m.button?.text || "";
  else if (t === "order") text = "🛒 Pedido";
  else text = "(Mensaje no admitido por WhatsApp)";
  return {
    type: t, text: clip(text, 4096),
    media: media ? { id: media.id, mime: media.mime_type || "", filename: clip(media.filename, 200), voice: !!media.voice } : null,
  };
}

const PREVIEW = { image: "📷 Foto", document: "📄 Documento", audio: "🎤 Audio", video: "🎬 Vídeo", sticker: "Sticker", template: "📋 Plantilla", interactive: "Menú" };
const preview = (type, text, filename) => clip(text || (type === "document" && filename ? `📄 ${filename}` : PREVIEW[type]) || "", 120);

// Una reacción no es un mensaje nuevo: se pega al mensaje al que reacciona.
async function reaction(m) {
  const waId = digits(m.from);
  const target = m.reaction?.message_id;
  if (!waId || !target) return;
  const ref = CHATS().doc(waId).collection("messages").doc(msgDocId(target));
  await ref.update({ reaction: clip(m.reaction?.emoji, 8) }).catch(() => {});
}

async function inbound(m, profileName) {
  if (m.type === "reaction") return reaction(m);
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
      ...(m.interactive?.list_reply?.id || m.interactive?.button_reply?.id ? { replyId: clip(m.interactive.list_reply?.id || m.interactive.button_reply?.id, 100) } : {}),
    });
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message)) return;
    throw e;
  }
  const cfg = await cfgLib.getConfig();
  const pre = await chatRef.get();
  const contact = pre.exists ? null : await findContact(waId);
  // En una transacción: dos mensajes que llegan a la vez cuentan los dos y solo uno de ellos
  // "abre" la conversación (bienvenida, asignación…).
  const r = await db.runTransaction(async (tx) => {
    const chat = (await tx.get(chatRef)).data();
    const isNew = !chat;
    const reentry = !isNew && cfg.entry.reentryDays > 0 && chat.lastInboundAt && at - chat.lastInboundAt > cfg.entry.reentryDays * 864e5;
    const reopened = !isNew && !!chat.archived;
    const patch = {
      orgId: DEFAULT_ORG_ID, waId, phone: `+${waId}`, profileName: clip(profileName, 120) || chat?.profileName || "",
      lastText: preview(p.type, p.text, p.media?.filename), lastDir: "in", lastAt: at, lastInboundAt: at,
      unread: (chat?.unread || 0) + 1, archived: false, closingDueAt: 0, updatedAt: Date.now(),
    };
    // Embudo (como ManyContacts): chat nuevo → 1.ª columna del embudo favorito; si vuelve a
    // escribir tras más de N días → 1.ª columna; si estaba archivado o fuera de todo embudo →
    // la columna elegida para contactos existentes (o la 1.ª). Si está abierto, se queda.
    let place = null;
    if (isNew || reentry) place = cfgLib.firstStage(cfg);
    else if (reopened || !chat.funnelId) place = cfgLib.parseStage(cfg, cfg.entry.existingStage) || cfgLib.firstStage(cfg);
    if (place) Object.assign(patch, place, { stageAt: Date.now() });
    if (isNew) {
      Object.assign(patch, {
        contactId: contact?.id || "", contactName: contact?.name || "", assigneeEmail: "", assigneeName: "", teamId: "",
        tags: [], notes: "", starred: false, blocked: false, optOut: false, createdAt: Date.now(),
      });
    }
    // BAJA / STOP: no recibirá difusiones; ALTA lo deshace.
    if (p.type === "text" && /^\s*(baja|stop|unsubscribe)\s*[.!]?\s*$/i.test(p.text)) patch.optOut = true;
    if (p.type === "text" && /^\s*(alta|start)\s*[.!]?\s*$/i.test(p.text)) patch.optOut = false;
    tx.set(chatRef, patch, { merge: true });
    return { chat: { ...(chat || {}), ...patch, id: waId }, isNew, newConversation: isNew || reentry || reopened };
  });
  if (p.media) await saveInboundMedia(msgRef, waId, id, p.media).catch(async (e) => {
    console.error("[whatsapp] archivo:", e.message || e);
    await msgRef.update({ "media.pending": false, "media.error": clip(e.message, 200) }).catch(() => {});
  });
  await auto().afterInbound({ ...r, msg: m, p, cfg }).catch((e) => console.error("[whatsapp] automático:", e.message || e));
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf" };
const extOf = (mime, filename) => (/\.([A-Za-z0-9]{1,6})$/.exec(filename || "")?.[1] || EXT[String(mime).split(";")[0]] || "bin").toLowerCase();

// Meta guarda los archivos poco tiempo: se descargan enseguida a nuestro Storage.
async function saveInboundMedia(msgRef, waId, id, media) {
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
    if (cur.status === "failed") return;
    const patch = { status: st.status, [`statusAt.${st.status}`]: Number(st.timestamp) * 1000 || Date.now() };
    if (st.status === "failed") patch.error = clip(explain(st.errors?.[0] || {}) || st.errors?.[0]?.title || "No se pudo entregar", 300);
    // Contadores de la difusión a la que pertenece el mensaje.
    if (cur.broadcastId) {
      const inc = admin.firestore.FieldValue.increment;
      const b = {};
      const was = RANK[cur.status] ?? 0;
      if (st.status === "failed") b.failed = inc(1);
      else {
        if (was < 2 && RANK[st.status] >= 2) b.delivered = inc(1);
        if (st.status === "read") b.read = inc(1);
      }
      if (Object.keys(b).length) tx.set(db.collection("waBroadcasts").doc(cur.broadcastId), b, { merge: true });
    }
    tx.update(ref, patch);
  });
}

/* ------------------------------------------------------------------ enviar */

// Envía a Meta. Devuelve el wamid y el wa_id que Meta reconoce (puede cambiar un dígito).
async function deliver(waId, msgBody) {
  const s = await settings();
  if (!s.phoneNumberId) throw httpError("WhatsApp no está configurado (falta el número en Ajustes)", 409);
  const out = await graph(`${s.phoneNumberId}/messages`, {
    method: "POST", body: { messaging_product: "whatsapp", recipient_type: "individual", to: waId, ...msgBody },
  });
  return { wamid: out.messages?.[0]?.id || `local-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`, waId: digits(out.contacts?.[0]?.wa_id) || waId };
}

// Guarda el mensaje saliente y actualiza el chat. `by`: { email, name } de quien lo envía
// o { auto: true, name } si lo manda el sistema (entonces no se marca el chat como leído).
async function storeOutbound(waId, wamid, data, by = {}, chatPatch = {}) {
  const ref = CHATS().doc(waId);
  const id = msgDocId(wamid);
  const at = Date.now();
  await ref.collection("messages").doc(id).set({
    orgId: DEFAULT_ORG_ID, chatId: waId, wamid, dir: "out", status: "pending", at, createdAt: at,
    byEmail: by.email ? norm(by.email) : "", byName: clip(by.name || by.email || "Automático", 120), auto: !!by.auto, ...data,
  });
  await ref.set({
    lastText: preview(data.type, data.text, data.media?.filename), lastDir: "out", lastAt: at, updatedAt: at,
    ...(by.auto ? {} : { unread: 0 }), ...chatPatch,
  }, { merge: true });
  return id;
}

// Envío automático (bienvenida, chatbot…): dentro de la ventana de 24 h, sin usuario.
async function sendAuto(waId, msgBody, data, name = "Respuesta automática") {
  const d = await deliver(waId, msgBody);
  return storeOutbound(waId, d.wamid, data, { auto: true, name });
}
const sendAutoText = (waId, text, name) => sendAuto(waId, { type: "text", text: { body: text, preview_url: /https?:\/\//.test(text) } }, { type: "text", text }, name);

async function openChat(chatId, { needWindow = true } = {}) {
  const waId = digits(chatId);
  const ref = CHATS().doc(waId || "x");
  const chat = (await ref.get()).data();
  if (!chat) throw httpError("Ese chat no existe", 404);
  if (chat.blocked) throw httpError("Este número está bloqueado. Desbloquéalo para escribirle.", 409);
  if (needWindow && (!chat.lastInboundAt || Date.now() - chat.lastInboundAt > WINDOW_MS)) {
    throw httpError("Han pasado más de 24 h desde el último mensaje del cliente. WhatsApp solo permite escribirle con una plantilla aprobada por Meta.", 409);
  }
  return { waId, ref, chat };
}

async function send(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const text = String(req.body?.text || "").trim().slice(0, 4096);
  if (!text) return fail(res, "Escribe un mensaje");
  const c = await openChat(req.body?.chatId);
  const replyTo = clip(req.body?.replyToWamid, 300);
  const d = await deliver(c.waId, { type: "text", text: { body: text, preview_url: /https?:\/\//.test(text) }, ...(replyTo ? { context: { message_id: replyTo } } : {}) });
  const id = await storeOutbound(c.waId, d.wamid, { type: "text", text, replyTo: replyTo ? msgDocId(replyTo) : "" }, user);
  res.json({ ok: true, id });
}

const KIND_OF = (mime) => (/^image\/(jpeg|png)$/.test(mime) ? "image" : /^video\/(mp4|3gpp)$/.test(mime) ? "video" : /^audio\//.test(mime) ? "audio" : "document");
const safeName = (s) => clip(s, 200).replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").trim() || "archivo";

// Sube un archivo a Meta (para enviarlo) y devuelve su id.
async function uploadMedia(buf, mime, filename) {
  const s = await settings();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([buf], { type: mime }), filename);
  return (await graph(`${s.phoneNumberId}/media`, { method: "POST", form })).id;
}
// Archivo que llega en base64 desde la app.
function fileFromBody(f) {
  const buf = Buffer.from(String(f?.data || ""), "base64");
  if (!buf.length) throw httpError("Falta el archivo", 400);
  if (buf.length > MAX_MEDIA) throw httpError("El archivo pasa de 16 MB", 413);
  return { buf, mime: clip(f.mime, 100) || "application/octet-stream", filename: safeName(f.name) };
}
async function saveCopy(waId, wamid, f) {
  const path = `whatsapp/${DEFAULT_ORG_ID}/${waId}/${msgDocId(wamid)}.${extOf(f.mime, f.filename)}`;
  await bucket().file(path).save(f.buf, { contentType: f.mime, resumable: false });
  return path;
}

async function sendMedia(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const b = req.body || {};
  const f = fileFromBody(b);
  const caption = String(b.caption || "").trim().slice(0, 1024);
  const c = await openChat(b.chatId);
  const mediaId = await uploadMedia(f.buf, f.mime, f.filename);
  const type = KIND_OF(f.mime);
  const payload = { id: mediaId, ...(type !== "audio" && caption ? { caption } : {}), ...(type === "document" ? { filename: f.filename } : {}) };
  const d = await deliver(c.waId, { type, [type]: payload });
  const path = await saveCopy(c.waId, d.wamid, f);
  const id = await storeOutbound(c.waId, d.wamid, { type, text: type !== "audio" ? caption : "", media: { mime: f.mime, filename: f.filename, path, size: f.buf.length } }, user);
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

// Al archivar, si hay mensaje de cierre y la ventana sigue abierta, se programa.
function closingPatch(cfg, chat) {
  const cl = cfg.autoReply?.closing;
  if (!cl?.enabled || !cl.text || !chat.lastInboundAt || Date.now() - chat.lastInboundAt > WINDOW_MS) return { closingDueAt: 0 };
  return { closingDueAt: Date.now() + (cl.minutes || 0) * 60e3 };
}

// Cambios de un chat: leído, archivar, asignar (agente/equipo), mover de embudo/columna,
// etiquetas, notas, destacado o ligar a un contacto del CRM.
async function updateChat(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const b = req.body || {};
  const ref = CHATS().doc(digits(b.chatId) || "x");
  const chat = (await ref.get()).data();
  if (!chat) return fail(res, "Ese chat no existe", 404);
  const cfg = await cfgLib.getConfig();
  const patch = {};
  if (b.read) patch.unread = 0;
  if (b.unread) patch.unread = Math.max(1, chat.unread || 0);
  if (typeof b.archived === "boolean") {
    patch.archived = b.archived;
    Object.assign(patch, b.archived ? closingPatch(cfg, chat) : { closingDueAt: 0 });
    if (!b.archived && !chat.funnelId) Object.assign(patch, cfgLib.firstStage(cfg), { stageAt: Date.now() });
  }
  if (typeof b.starred === "boolean") patch.starred = b.starred;
  if ("assigneeEmail" in b) { patch.assigneeEmail = norm(b.assigneeEmail).slice(0, 150); patch.assigneeName = clip(b.assigneeName, 120); }
  if ("teamId" in b) {
    if (b.teamId && !cfg.teams.some((t) => t.id === b.teamId)) return fail(res, "Ese equipo no existe", 404);
    patch.teamId = clip(b.teamId, 40);
  }
  if ("stage" in b) {
    if (!b.stage) Object.assign(patch, { funnelId: "", stageId: "" });
    else {
      const st = cfgLib.parseStage(cfg, b.stage);
      if (!st) return fail(res, "Esa columna no existe", 404);
      Object.assign(patch, st, { stageAt: Date.now() });
    }
  }
  if (Array.isArray(b.tags)) patch.tags = b.tags.filter((t) => cfg.tags.some((x) => x.id === t)).slice(0, 20);
  if ("notes" in b) patch.notes = String(b.notes || "").slice(0, 5000);
  if ("contactId" in b) {
    const cid = clip(b.contactId, 80);
    if (cid) {
      const c = (await db.collection("contacts").doc(cid).get()).data();
      if (!c || c.orgId !== DEFAULT_ORG_ID) return fail(res, "Ese contacto no existe", 404);
      Object.assign(patch, { contactId: cid, contactName: `${c.firstName || ""} ${c.lastName || ""}`.trim() });
    } else Object.assign(patch, { contactId: "", contactName: "" });
  }
  if (!Object.keys(patch).length) return res.json({ ok: true });
  patch.updatedAt = Date.now();
  await ref.update(patch);
  res.json({ ok: true });
}

// Acciones de columna del embudo: mover o archivar los míos / todos, o vaciar la columna.
async function bulk(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const b = req.body || {};
  const cfg = await cfgLib.getConfig();
  const from = cfgLib.parseStage(cfg, b.from);
  if (!from) return fail(res, "Esa columna no existe", 404);
  const action = ["move", "archive", "clear"].includes(b.action) ? b.action : "";
  if (!action) return fail(res, "Acción no válida");
  const to = action === "move" ? cfgLib.parseStage(cfg, b.to) : null;
  if (action === "move" && !to) return fail(res, "Elige la columna de destino");
  if (action === "clear" && !(await isAdmin(user.email))) return fail(res, "Solo un administrador puede vaciar una columna", 403);
  const me = norm(user.email);
  const snap = await CHATS().where("funnelId", "==", from.funnelId).get();
  const docs = snap.docs.filter((d) => {
    const c = d.data();
    return c.stageId === from.stageId && !c.archived && (b.scope !== "mine" || c.assigneeEmail === me);
  });
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 400)) {
      const c = d.data();
      const patch = action === "move" ? { ...to, stageAt: Date.now() }
        : action === "archive" ? { archived: true, ...closingPatch(cfg, c) }
        : { funnelId: "", stageId: "" };
      batch.update(d.ref, { ...patch, updatedAt: Date.now() });
    }
    await batch.commit();
  }
  res.json({ ok: true, count: docs.length });
}

// Bloquear / desbloquear un número (Meta deja de entregarnos sus mensajes).
async function block(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const waId = digits(req.body?.chatId);
  const ref = CHATS().doc(waId || "x");
  if (!(await ref.get()).exists) return fail(res, "Ese chat no existe", 404);
  const blocked = req.body?.blocked === true;
  const s = await settings();
  await graph(`${s.phoneNumberId}/block_users`, { method: blocked ? "POST" : "DELETE", body: { messaging_product: "whatsapp", block_users: [{ user: waId }] } });
  await ref.update({ blocked, updatedAt: Date.now(), ...(blocked ? { archived: true } : {}) });
  res.json({ ok: true });
}

/* ------------------------------------------------------------------ configuración */

async function getConfig(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  res.json({ ok: true, admin: await isAdmin(user.email), config: await cfgLib.getConfig(true) });
}
async function saveConfig(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const patch = await cfgLib.saveConfig(user, await isAdmin(user.email), clip(req.body?.section, 30), req.body?.value);
  res.json({ ok: true, patch });
}

/* ------------------------------------------------------------------ ajustes */

async function getSettings(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const s = await settings(true);
  res.json({
    ok: true, admin: await isAdmin(user.email),
    settings: {
      phoneNumberId: s.phoneNumberId || "", wabaId: s.wabaId || "", appId: s.appId || "", verifyToken: s.verifyToken || "",
      displayPhone: s.displayPhone || "", verifiedName: s.verifiedName || "", quality: s.quality || "",
      messagingLimit: s.messagingLimit || "", hasToken: !!s.token, hasAppSecret: !!s.appSecret, checkedAt: s.checkedAt || 0,
      templatesSyncedAt: s.templatesSyncedAt || 0, webhookUrl: `${PUBLIC_URL}/api/whatsapp/webhook`,
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
    appId: digits(b.appId).slice(0, 30) || cur.appId || "",
    verifyToken: clip(b.verifyToken, 100) || cur.verifyToken || crypto.randomBytes(16).toString("hex"),
    token: String(b.token || "").trim() || cur.token || "", appSecret: String(b.appSecret || "").trim() || cur.appSecret || "",
  };
  if (!next.phoneNumberId) return fail(res, "Falta el identificador del número de teléfono");
  if (!next.token) return fail(res, "Falta el token de acceso");
  // Se comprueba con Meta antes de guardar: así no se queda guardado algo que no funciona.
  let info;
  try {
    info = await graph(`${next.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`, { token: next.token });
  } catch (e) {
    return fail(res, `Meta no acepta estos datos: ${e.message}`, 400);
  }
  // La cuenta (WABA) tiene que suscribir esta app para que lleguen los mensajes al webhook.
  let subscribed = false;
  if (next.wabaId) {
    subscribed = await graph(`${next.wabaId}/subscribed_apps`, { method: "POST", token: next.token }).then(() => true).catch(() => false);
  }
  await SETTINGS().set({
    ...next, displayPhone: clip(info.display_phone_number, 40), verifiedName: clip(info.verified_name, 120),
    quality: clip(info.quality_rating, 20), messagingLimit: clip(info.messaging_limit_tier, 30),
    checkedAt: Date.now(), updatedAt: Date.now(), updatedBy: norm(user.email),
  }, { merge: true });
  cache = null;
  // Primera sincronización de plantillas (si falla no impide guardar).
  if (next.wabaId) await require("./waTemplates").syncTemplates().catch(() => {});
  res.json({ ok: true, subscribed });
}

// Envuelve cada ruta: los errores con status (409, 502…) llegan a la app con su mensaje.
const route = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (e.status && !res.headersSent) return fail(res, e.message, e.status);
  console.error(`[whatsapp] ${req.method} ${req.path}:`, e.message || e);
  if (!res.headersSent) fail(res, "Error interno", 500);
});

module.exports = {
  verifyWebhook, receiveWebhook: route(receiveWebhook), send: route(send), sendMedia: route(sendMedia),
  fileUrl: route(fileUrl), updateChat: route(updateChat), bulk: route(bulk), block: route(block),
  getConfig: route(getConfig), saveConfig: route(saveConfig),
  getSettings: route(getSettings), saveSettings: route(saveSettings),
  // para waAuto / waTemplates
  route, staff, isAdmin, settings, graph, deliver, storeOutbound, sendAuto, sendAutoText, openChat, findContact,
  uploadMedia, fileFromBody, saveCopy, toWaId, clip, digits, fail, httpError, msgDocId, CHATS, SETTINGS, WINDOW_MS, KIND_OF, GRAPH, VERSION,
  resetSettingsCache: () => { cache = null; },
  // para las pruebas
  processPayload, parseInbound,
};
