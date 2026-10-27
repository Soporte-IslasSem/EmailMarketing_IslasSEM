// WhatsApp (sección WhatsApp de la app) con la API oficial de Meta (WhatsApp Cloud API), sin
// intermediarios. Multiempresa: cada empresa conecta SU número y su cuenta de WhatsApp Business.
//
// - Ajustes (organizations/{org}/private/whatsappSettings): identificador del número, de la
//   cuenta (WABA), token de acceso, clave secreta de la app y token de verificación del webhook.
//   El token y la clave secreta NUNCA salen del servidor: la app solo sabe si están puestos.
//   Dos formas de conectar:
//   · Con un botón (Embedded Signup de Meta, app de la plataforma: META_APP_ID/META_APP_SECRET/
//     META_CONFIG_ID): la empresa entra con su Facebook, elige o registra su número y listo.
//   · A mano (su propia app de Meta): pega los identificadores, el token y la clave secreta.
// - Índice (waIndex): número (phone_<id>), cuenta (waba_<id>) y token de verificación
//   (verify_<token>) → empresa. Un número solo puede estar en una empresa.
// - Webhook (/api/whatsapp/webhook, uno para todas): Meta avisa de cada mensaje que entra, de
//   cada cambio de estado (enviado, entregado, leído, fallido) y de las revisiones de
//   plantillas. Cada aviso va a la empresa de su número/cuenta, y solo si la firma
//   (X-Hub-Signature-256) es válida con la clave de la plataforma o con la de esa empresa.
// - Chats (organizations/{org}/waChats/<wa_id>): uno por número de cliente. Se liga al contacto
//   del CRM con el mismo teléfono (o a mano). Mensajes en …/waChats/<wa_id>/messages/<id>.
//   Cada chat está en una columna de un embudo (funnelId/stageId), con equipo, agente,
//   etiquetas y notas.
// - La app LEE chats y mensajes en tiempo real (reglas: solo los de su empresa y quien puede
//   ver contactos) pero no escribe: enviar, asignar, mover, archivar o ligar pasa por aquí.
// - Regla de WhatsApp: solo se puede escribir texto libre si el cliente escribió en las
//   últimas 24 h. Fuera de esa ventana hacen falta plantillas aprobadas (waTemplates.js).
// - Lo automático (embudo de entrada, asignación, bienvenida, fuera de horario, chatbot,
//   mensaje de cierre) está en waAuto.js.
const crypto = require("crypto");
const { admin, db, bucket } = require("./firebase");
const { staffFromReq } = require("./access");
const { norm } = require("./link");
const { orgRef, orgPrivate, privateRef, featuresOf } = require("./tenant");
const cfgLib = require("./waConfig");

const GRAPH = (process.env.WA_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "");
const VERSION = process.env.WA_GRAPH_VERSION || "v23.0";
const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
// App de Meta de la plataforma (conexión con un botón).
const META = () => ({ appId: process.env.META_APP_ID || "", appSecret: process.env.META_APP_SECRET || "", configId: process.env.META_CONFIG_ID || "", verifyToken: process.env.META_VERIFY_TOKEN || "" });
const SETTINGS = (orgId) => privateRef(orgId, "whatsappSettings");
const CHATS = (orgId) => orgRef(orgId).collection("waChats");
const INDEX = () => db.collection("waIndex");
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

// Ajustes de cada empresa en memoria 30 s (el webhook llega muy seguido).
const cache = new Map();
async function settings(orgId, fresh = false) {
  if (!orgId) throw httpError("Falta la empresa", 500);
  const hit = cache.get(orgId);
  if (!fresh && hit && Date.now() - hit.at < 30e3) return hit.s;
  const s = (await (await orgPrivate(orgId, "whatsappSettings")).get()).data() || {};
  cache.set(orgId, { at: Date.now(), s });
  return s;
}
const resetSettingsCache = (orgId) => (orgId ? cache.delete(orgId) : cache.clear());

// Índice número/cuenta/token → empresa (60 s en memoria).
const idxCache = new Map();
const idxKey = (kind, id) => `${kind}_${String(id || "").replace(/[^A-Za-z0-9_-]/g, "")}`;
async function indexOrg(kind, id) {
  const key = idxKey(kind, id);
  if (!id || key.length < kind.length + 2) return null;
  const hit = idxCache.get(key);
  if (hit && Date.now() - hit.at < 60e3) return hit.orgId;
  const orgId = (await INDEX().doc(key).get()).data()?.orgId || null;
  idxCache.set(key, { at: Date.now(), orgId });
  if (idxCache.size > 5000) idxCache.clear();
  return orgId;
}

async function staff(req, res) {
  const user = await staffFromReq(req);
  if (!user) { res.status(401).json({ ok: false, error: "Sesión no válida" }); return null; }
  if (!featuresOf(user.org).whatsapp) { res.status(403).json({ ok: false, error: "WhatsApp no está incluido en tu plan" }); return null; }
  return user;
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

async function graph(orgId, path, { method = "GET", body, form, token } = {}) {
  const tk = token || (await settings(orgId)).token;
  if (!tk) throw httpError("WhatsApp no está configurado (falta conectar el número en Ajustes)", 409);
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
  if (code === 190) return "El token de acceso de Meta no es válido o ha caducado. Vuelve a conectar WhatsApp en Ajustes.";
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
  if (code === 133005) return "El PIN de verificación en dos pasos no coincide. Quítalo o cámbialo en WhatsApp Manager y vuelve a intentarlo.";
  if (code === 133010) return "El número aún no está registrado en la API de WhatsApp.";
  if (code === 368) return "Meta ha restringido temporalmente esta cuenta por incumplir sus políticas.";
  if (code === 100) return `Petición rechazada por Meta: ${e.error_data?.details || e.error_user_msg || e.message || "parámetro no válido"}`;
  return e.error_user_msg || e.error_data?.details || e.message || "";
}

/* ------------------------------------------------------------------ contactos */

// Contacto del CRM de la empresa con ese número (compara los últimos 9 dígitos de teléfono y WhatsApp).
async function findContact(orgId, waId) {
  const key = digits(waId).slice(-9);
  if (key.length < 9) return null;
  const snap = await db.collection("contacts").where("orgId", "==", orgId).select("phone", "whatsapp", "firstName", "lastName", "deleted").get();
  const hit = snap.docs.find((d) => {
    const c = d.data();
    return !c.deleted && [c.phone, c.whatsapp].some((p) => digits(p).length >= 9 && digits(p).slice(-9) === key);
  });
  if (!hit) return null;
  const c = hit.data();
  return { id: hit.id, name: `${c.firstName || ""} ${c.lastName || ""}`.trim() };
}

/* ------------------------------------------------------------------ webhook */

// Meta comprueba el webhook con el token de verificación: el de la app de la plataforma o el
// de una empresa que conectó su propia app.
function verifyWebhook(req, res) {
  (async () => {
    const token = String(req.query["hub.verify_token"] || "");
    if (req.query["hub.mode"] !== "subscribe" || !token) return res.sendStatus(403);
    const platform = !!META().verifyToken && token === META().verifyToken;
    const own = !platform && /^[A-Za-z0-9_-]{8,100}$/.test(token) && (await indexOrg("verify", token));
    if (!platform && !own) return res.sendStatus(403);
    res.type("text/plain").send(String(req.query["hub.challenge"] || ""));
  })().catch(() => res.sendStatus(500));
}

function signatureOk(raw, sig, secret) {
  if (!secret || !sig) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

async function receiveWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  let payload;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return res.sendStatus(400); }
  const sig = String(req.headers["x-hub-signature-256"] || "");
  const platformOk = signatureOk(raw, sig, META().appSecret);
  // Cada cambio va a la empresa de su número (mensajes) o de su cuenta (plantillas).
  const jobs = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const orgId = change.field === "messages"
        ? await indexOrg("phone", v.metadata?.phone_number_id)
        : await indexOrg("waba", entry.id);
      if (orgId) jobs.push({ orgId, change });
    }
  }
  // Firma: la de la plataforma vale para todas; si no, la de la app propia de esa empresa.
  const allowed = new Map();
  for (const orgId of new Set(jobs.map((j) => j.orgId))) {
    allowed.set(orgId, platformOk || signatureOk(raw, sig, (await settings(orgId)).appSecret));
  }
  const ok = jobs.filter((j) => allowed.get(j.orgId));
  if (jobs.length && !ok.length) return res.sendStatus(401);
  // Meta reintenta si no respondemos rápido: se contesta ya y se procesa después.
  res.sendStatus(200);
  for (const j of ok) {
    try { await processChange(j.orgId, j.change); } catch (e) { console.error("[whatsapp] webhook:", j.orgId, e.message || e); }
  }
}

async function processChange(orgId, change) {
  const v = change.value || {};
  if (change.field === "message_template_status_update" || change.field === "message_template_quality_update") {
    return require("./waTemplates").templateEvent(orgId, change.field, v).catch((e) => console.error("[whatsapp] plantilla:", e.message || e));
  }
  if (change.field !== "messages" || !v.metadata) return;
  const s = await settings(orgId);
  if (s.phoneNumberId && String(v.metadata.phone_number_id) !== String(s.phoneNumberId)) return;
  const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || ""]));
  for (const m of v.messages || []) await inbound(orgId, m, names[m.from] || "").catch((e) => console.error("[whatsapp] mensaje:", e.message || e));
  for (const st of v.statuses || []) await statusUpdate(orgId, st).catch((e) => console.error("[whatsapp] estado:", e.message || e));
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
async function reaction(orgId, m) {
  const waId = digits(m.from);
  const target = m.reaction?.message_id;
  if (!waId || !target) return;
  const ref = CHATS(orgId).doc(waId).collection("messages").doc(msgDocId(target));
  await ref.update({ reaction: clip(m.reaction?.emoji, 8) }).catch(() => {});
}

async function inbound(orgId, m, profileName) {
  if (m.type === "reaction") return reaction(orgId, m);
  const waId = digits(m.from);
  if (!waId) return;
  const id = msgDocId(m.id);
  const chatRef = CHATS(orgId).doc(waId);
  const msgRef = chatRef.collection("messages").doc(id);
  const p = parseInbound(m);
  const at = Number(m.timestamp) * 1000 || Date.now();
  // create() falla si ya existe: Meta puede repetir el aviso y así no se duplica.
  try {
    await msgRef.create({
      orgId, chatId: waId, wamid: m.id, dir: "in", type: p.type, text: p.text,
      media: p.media ? { ...p.media, path: "", pending: true } : null,
      replyTo: m.context?.id ? msgDocId(m.context.id) : "", at, createdAt: Date.now(),
      ...(m.interactive?.list_reply?.id || m.interactive?.button_reply?.id ? { replyId: clip(m.interactive.list_reply?.id || m.interactive.button_reply?.id, 100) } : {}),
    });
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message)) return;
    throw e;
  }
  const cfg = await cfgLib.getConfig(orgId);
  const pre = await chatRef.get();
  const contact = pre.exists ? null : await findContact(orgId, waId);
  // En una transacción: dos mensajes que llegan a la vez cuentan los dos y solo uno de ellos
  // "abre" la conversación (bienvenida, asignación…).
  const r = await db.runTransaction(async (tx) => {
    const chat = (await tx.get(chatRef)).data();
    const isNew = !chat;
    const reentry = !isNew && cfg.entry.reentryDays > 0 && chat.lastInboundAt && at - chat.lastInboundAt > cfg.entry.reentryDays * 864e5;
    const reopened = !isNew && !!chat.archived;
    const patch = {
      orgId, waId, phone: `+${waId}`, profileName: clip(profileName, 120) || chat?.profileName || "",
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
    const moved = place && (place.funnelId !== chat?.funnelId || place.stageId !== chat?.stageId);
    return { chat: { ...(chat || {}), ...patch, id: waId }, isNew, newConversation: isNew || reentry || reopened, placed: moved ? place : null, reopenedOnly: reopened && !moved };
  });
  if (r.placed) await logEvent(orgId, waId, `Automático: ${stageText(cfg, r.placed.funnelId, r.placed.stageId)}`, "stage");
  else if (r.reopenedOnly) await logEvent(orgId, waId, "Conversación reabierta: el cliente ha vuelto a escribir", "archive");
  if (p.media) await saveInboundMedia(orgId, msgRef, waId, id, p.media).catch(async (e) => {
    console.error("[whatsapp] archivo:", e.message || e);
    await msgRef.update({ "media.pending": false, "media.error": clip(e.message, 200) }).catch(() => {});
  });
  await auto().afterInbound({ orgId, ...r, msg: m, p, cfg }).catch((e) => console.error("[whatsapp] automático:", e.message || e));
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf" };
const extOf = (mime, filename) => (/\.([A-Za-z0-9]{1,6})$/.exec(filename || "")?.[1] || EXT[String(mime).split(";")[0]] || "bin").toLowerCase();

// Meta guarda los archivos poco tiempo: se descargan enseguida a nuestro Storage.
async function saveInboundMedia(orgId, msgRef, waId, id, media) {
  const info = await graph(orgId, media.id);
  if (Number(info.file_size) > MAX_MEDIA) {
    await msgRef.update({ "media.pending": false, "media.error": "Archivo demasiado grande para guardarlo (más de 16 MB)", "media.size": Number(info.file_size) });
    return;
  }
  const s = await settings(orgId);
  const r = await fetch(info.url, { headers: { Authorization: `Bearer ${s.token}` } });
  if (!r.ok) throw new Error(`Descarga del archivo: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const mime = info.mime_type || media.mime || "application/octet-stream";
  const path = `whatsapp/${orgId}/${waId}/${id}.${extOf(mime, media.filename)}`;
  await bucket().file(path).save(buf, { contentType: mime, resumable: false });
  await msgRef.update({ "media.path": path, "media.pending": false, "media.size": buf.length, "media.mime": mime });
}

async function statusUpdate(orgId, st) {
  const waId = digits(st.recipient_id);
  if (!waId || !st.id) return;
  const ref = CHATS(orgId).doc(waId).collection("messages").doc(msgDocId(st.id));
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
      if (Object.keys(b).length) tx.set(orgRef(orgId).collection("waBroadcasts").doc(cur.broadcastId), b, { merge: true });
    }
    tx.update(ref, patch);
  });
}

/* ------------------------------------------------------------------ avisos en la conversación */

// Como ManyContacts: lo que pasa con el chat (archivar, mover de columna, asignar, bloquear…)
// queda en su historial como un aviso. No cuenta como mensaje nuevo ni cambia el último mensaje.
async function logEvent(orgId, waId, text, kind = "info") {
  const at = Date.now();
  await CHATS(orgId).doc(waId).collection("messages").add({ orgId, chatId: waId, dir: "event", type: "event", kind, text: clip(text, 300), at, createdAt: at })
    .catch((e) => console.warn("[whatsapp] aviso:", e.message));
}
// "Embudo → Columna" de un chat.
function stageText(cfg, funnelId, stageId) {
  const f = cfg.funnels.find((x) => x.id === funnelId);
  const s = f?.stages.find((x) => x.id === stageId);
  return f && s ? `${f.name} → ${s.name}` : "";
}
// Nombre de quien hace el cambio (el de Empleados/Accesos; si no, su email).
async function actorName(orgId, email) {
  const p = (await cfgLib.people(orgId)).find((x) => x.email === norm(email));
  return p?.name || email;
}

/* ------------------------------------------------------------------ enviar */

// Envía a Meta. Devuelve el wamid y el wa_id que Meta reconoce (puede cambiar un dígito).
async function deliver(orgId, waId, msgBody) {
  const s = await settings(orgId);
  if (!s.phoneNumberId) throw httpError("WhatsApp no está configurado (falta conectar el número en Ajustes)", 409);
  const out = await graph(orgId, `${s.phoneNumberId}/messages`, {
    method: "POST", body: { messaging_product: "whatsapp", recipient_type: "individual", to: waId, ...msgBody },
  });
  return { wamid: out.messages?.[0]?.id || `local-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`, waId: digits(out.contacts?.[0]?.wa_id) || waId };
}

// Guarda el mensaje saliente y actualiza el chat. `by`: { email, name } de quien lo envía
// o { auto: true, name } si lo manda el sistema (entonces no se marca el chat como leído).
async function storeOutbound(orgId, waId, wamid, data, by = {}, chatPatch = {}) {
  const ref = CHATS(orgId).doc(waId);
  const id = msgDocId(wamid);
  const at = Date.now();
  await ref.collection("messages").doc(id).set({
    orgId, chatId: waId, wamid, dir: "out", status: "pending", at, createdAt: at,
    byEmail: by.email ? norm(by.email) : "", byName: clip(by.name || by.email || "Automático", 120), auto: !!by.auto, ...data,
  });
  await ref.set({
    lastText: preview(data.type, data.text, data.media?.filename), lastDir: "out", lastAt: at, updatedAt: at,
    ...(by.auto ? {} : { unread: 0 }), ...chatPatch,
  }, { merge: true });
  return id;
}

// Envío automático (bienvenida, chatbot…): dentro de la ventana de 24 h, sin usuario.
async function sendAuto(orgId, waId, msgBody, data, name = "Respuesta automática") {
  const d = await deliver(orgId, waId, msgBody);
  return storeOutbound(orgId, waId, d.wamid, data, { auto: true, name });
}
const sendAutoText = (orgId, waId, text, name) => sendAuto(orgId, waId, { type: "text", text: { body: text, preview_url: /https?:\/\//.test(text) } }, { type: "text", text }, name);

async function openChat(orgId, chatId, { needWindow = true } = {}) {
  const waId = digits(chatId);
  const ref = CHATS(orgId).doc(waId || "x");
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
  const c = await openChat(user.orgId, req.body?.chatId);
  const replyTo = clip(req.body?.replyToWamid, 300);
  const d = await deliver(user.orgId, c.waId, { type: "text", text: { body: text, preview_url: /https?:\/\//.test(text) }, ...(replyTo ? { context: { message_id: replyTo } } : {}) });
  const id = await storeOutbound(user.orgId, c.waId, d.wamid, { type: "text", text, replyTo: replyTo ? msgDocId(replyTo) : "" }, user);
  res.json({ ok: true, id });
}

const KIND_OF = (mime) => (/^image\/(jpeg|png)$/.test(mime) ? "image" : /^video\/(mp4|3gpp)$/.test(mime) ? "video" : /^audio\//.test(mime) ? "audio" : "document");
const safeName = (s) => clip(s, 200).replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").trim() || "archivo";

// Sube un archivo a Meta (para enviarlo) y devuelve su id.
async function uploadMedia(orgId, buf, mime, filename) {
  const s = await settings(orgId);
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([buf], { type: mime }), filename);
  return (await graph(orgId, `${s.phoneNumberId}/media`, { method: "POST", form })).id;
}
// Archivo que llega en base64 desde la app.
function fileFromBody(f) {
  const buf = Buffer.from(String(f?.data || ""), "base64");
  if (!buf.length) throw httpError("Falta el archivo", 400);
  if (buf.length > MAX_MEDIA) throw httpError("El archivo pasa de 16 MB", 413);
  return { buf, mime: clip(f.mime, 100) || "application/octet-stream", filename: safeName(f.name) };
}
async function saveCopy(orgId, waId, wamid, f) {
  const path = `whatsapp/${orgId}/${waId}/${msgDocId(wamid)}.${extOf(f.mime, f.filename)}`;
  await bucket().file(path).save(f.buf, { contentType: f.mime, resumable: false });
  return path;
}

async function sendMedia(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const b = req.body || {};
  const f = fileFromBody(b);
  const caption = String(b.caption || "").trim().slice(0, 1024);
  const c = await openChat(user.orgId, b.chatId);
  const mediaId = await uploadMedia(user.orgId, f.buf, f.mime, f.filename);
  const type = KIND_OF(f.mime);
  const payload = { id: mediaId, ...(type !== "audio" && caption ? { caption } : {}), ...(type === "document" ? { filename: f.filename } : {}) };
  const d = await deliver(user.orgId, c.waId, { type, [type]: payload });
  const path = await saveCopy(user.orgId, c.waId, d.wamid, f);
  const id = await storeOutbound(user.orgId, c.waId, d.wamid, { type, text: type !== "audio" ? caption : "", media: { mime: f.mime, filename: f.filename, path, size: f.buf.length } }, user);
  res.json({ ok: true, id });
}

/* ------------------------------------------------------------------ gestión de chats */

async function fileUrl(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const ref = CHATS(user.orgId).doc(digits(req.body?.chatId) || "x").collection("messages").doc(clip(req.body?.id, 80) || "x");
  const m = (await ref.get()).data();
  if (!m?.media?.path || !m.media.path.startsWith(`whatsapp/${user.orgId}/`)) return fail(res, "Ese archivo no está disponible", 404);
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
  const ref = CHATS(user.orgId).doc(digits(b.chatId) || "x");
  const chat = (await ref.get()).data();
  if (!chat) return fail(res, "Ese chat no existe", 404);
  const cfg = await cfgLib.getConfig(user.orgId);
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
      if (!c || c.orgId !== user.orgId) return fail(res, "Ese contacto no existe", 404);
      Object.assign(patch, { contactId: cid, contactName: `${c.firstName || ""} ${c.lastName || ""}`.trim() });
    } else Object.assign(patch, { contactId: "", contactName: "" });
  }
  if (!Object.keys(patch).length) return res.json({ ok: true });
  patch.updatedAt = Date.now();
  await ref.update(patch);
  res.json({ ok: true });
  // Avisos en el historial (después de responder: no retrasan la app).
  const who = await actorName(user.orgId, user.email).catch(() => user.email);
  const waId = ref.id;
  if (typeof b.archived === "boolean" && b.archived !== !!chat.archived) await logEvent(user.orgId, waId, `Conversación ${b.archived ? "archivada" : "desarchivada"} por ${who}`, "archive");
  if ("stage" in b && (patch.funnelId !== chat.funnelId || patch.stageId !== chat.stageId)) {
    await logEvent(user.orgId, waId, patch.funnelId ? `${who}: ${stageText(cfg, patch.funnelId, patch.stageId)}` : `${who} lo ha sacado de los embudos`, "stage");
  }
  if ("assigneeEmail" in b && patch.assigneeEmail !== (chat.assigneeEmail || "")) {
    await logEvent(user.orgId, waId, patch.assigneeEmail ? `Asignada a ${patch.assigneeName || patch.assigneeEmail} por ${who}` : `${who} ha quitado la asignación`, "assign");
  }
  if ("teamId" in b && patch.teamId !== (chat.teamId || "")) {
    const t = cfg.teams.find((x) => x.id === patch.teamId);
    await logEvent(user.orgId, waId, t ? `Equipo ${t.name} (por ${who})` : `${who} ha quitado el equipo`, "assign");
  }
  if ("contactId" in b && patch.contactId !== (chat.contactId || "")) {
    await logEvent(user.orgId, waId, patch.contactId ? `Ligado al contacto ${patch.contactName || ""} por ${who}` : `${who} ha desligado el contacto`, "contact");
  }
}

// Acciones de columna del embudo: mover o archivar los míos / todos, o vaciar la columna.
async function bulk(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const b = req.body || {};
  const cfg = await cfgLib.getConfig(user.orgId);
  const from = cfgLib.parseStage(cfg, b.from);
  if (!from) return fail(res, "Esa columna no existe", 404);
  const action = ["move", "archive", "clear"].includes(b.action) ? b.action : "";
  if (!action) return fail(res, "Acción no válida");
  const to = action === "move" ? cfgLib.parseStage(cfg, b.to) : null;
  if (action === "move" && !to) return fail(res, "Elige la columna de destino");
  if (action === "clear" && !user.isAdmin) return fail(res, "Solo un administrador puede vaciar una columna", 403);
  const me = norm(user.email);
  const snap = await CHATS(user.orgId).where("funnelId", "==", from.funnelId).get();
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
  const who = await actorName(user.orgId, user.email).catch(() => user.email);
  const text = action === "move" ? `${who}: ${stageText(cfg, to.funnelId, to.stageId)}` : action === "archive" ? `Conversación archivada por ${who}` : `${who} lo ha sacado de los embudos`;
  for (const d of docs) await logEvent(user.orgId, d.id, text, action === "archive" ? "archive" : "stage");
}

// Bloquear / desbloquear un número (Meta deja de entregarnos sus mensajes).
async function block(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const waId = digits(req.body?.chatId);
  const ref = CHATS(user.orgId).doc(waId || "x");
  if (!(await ref.get()).exists) return fail(res, "Ese chat no existe", 404);
  const blocked = req.body?.blocked === true;
  const s = await settings(user.orgId);
  await graph(user.orgId, `${s.phoneNumberId}/block_users`, { method: blocked ? "POST" : "DELETE", body: { messaging_product: "whatsapp", block_users: [{ user: waId }] } });
  await ref.update({ blocked, updatedAt: Date.now(), ...(blocked ? { archived: true } : {}) });
  res.json({ ok: true });
  await logEvent(user.orgId, waId, `Número ${blocked ? "bloqueado" : "desbloqueado"} por ${await actorName(user.orgId, user.email).catch(() => user.email)}`, "block");
}

/* ------------------------------------------------------------------ configuración */

async function getConfig(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  res.json({ ok: true, admin: user.isAdmin, config: await cfgLib.getConfig(user.orgId, true) });
}
async function saveConfig(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const patch = await cfgLib.saveConfig(user, user.isAdmin, clip(req.body?.section, 30), req.body?.value);
  res.json({ ok: true, patch });
}

/* ------------------------------------------------------------------ conexión (ajustes) */

async function getSettings(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const s = await settings(user.orgId, true);
  const m = META();
  res.json({
    ok: true, admin: user.isAdmin,
    settings: {
      phoneNumberId: s.phoneNumberId || "", wabaId: s.wabaId || "", appId: s.platformApp ? "" : s.appId || "", verifyToken: s.platformApp ? "" : s.verifyToken || "",
      displayPhone: s.displayPhone || "", verifiedName: s.verifiedName || "", quality: s.quality || "",
      messagingLimit: s.messagingLimit || "", hasToken: !!s.token, hasAppSecret: !!s.appSecret, checkedAt: s.checkedAt || 0,
      templatesSyncedAt: s.templatesSyncedAt || 0, webhookUrl: `${PUBLIC_URL}/api/whatsapp/webhook`,
      platformApp: !!s.platformApp, connectedVia: s.token ? s.connectedVia || "manual" : "",
    },
    // Conexión con un botón (si la plataforma tiene su app de Meta configurada).
    embedded: m.appId && m.configId && m.appSecret ? { appId: m.appId, configId: m.configId, version: VERSION } : null,
  });
}

// Guarda la conexión de una empresa y su índice (número/cuenta/token → empresa). Un número o
// una cuenta que ya usa otra empresa no se puede conectar.
async function assertFree(orgId, ids) {
  for (const [kind, id] of ids) {
    if (!id) continue;
    const other = (await INDEX().doc(idxKey(kind, id)).get()).data()?.orgId;
    if (other && other !== orgId) {
      throw httpError(kind === "phone" ? "Ese número de WhatsApp ya está conectado en otra empresa de la plataforma." : "Esa cuenta de WhatsApp Business ya está conectada en otra empresa de la plataforma.", 409);
    }
  }
}
async function storeConnection(user, next, info) {
  const orgId = user.orgId;
  await assertFree(orgId, [["phone", next.phoneNumberId], ["waba", next.wabaId]]);
  const cur = await settings(orgId, true);
  const batch = db.batch();
  // Quita del índice lo que esta empresa tenía antes y ya no usa.
  for (const [kind, oldId, newId] of [["phone", cur.phoneNumberId, next.phoneNumberId], ["waba", cur.wabaId, next.wabaId], ["verify", cur.verifyToken, next.verifyToken]]) {
    if (oldId && oldId !== newId) batch.delete(INDEX().doc(idxKey(kind, oldId)));
    if (newId) batch.set(INDEX().doc(idxKey(kind, newId)), { orgId, kind, at: Date.now() });
  }
  batch.set(SETTINGS(orgId), {
    ...next, displayPhone: clip(info.display_phone_number, 40), verifiedName: clip(info.verified_name, 120),
    quality: clip(info.quality_rating, 20), messagingLimit: clip(info.messaging_limit_tier, 30),
    checkedAt: Date.now(), updatedAt: Date.now(), updatedBy: norm(user.email), disconnectedAt: admin.firestore.FieldValue.delete(),
  }, { merge: true });
  await batch.commit();
  resetSettingsCache(orgId);
  idxCache.clear();
}

const PHONE_FIELDS = "display_phone_number,verified_name,quality_rating,messaging_limit_tier";

// Conexión a mano (app de Meta propia de la empresa).
async function saveSettings(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  if (!user.isAdmin) return fail(res, "Solo un administrador puede cambiar la conexión de WhatsApp", 403);
  const b = req.body || {};
  const cur = await settings(user.orgId, true);
  const own = !cur.platformApp; // si venía del botón, al guardar a mano pasa a app propia
  const next = {
    phoneNumberId: digits(b.phoneNumberId).slice(0, 30), wabaId: digits(b.wabaId).slice(0, 30),
    appId: digits(b.appId).slice(0, 30) || (own ? cur.appId : "") || "",
    verifyToken: clip(b.verifyToken, 100).replace(/[^A-Za-z0-9_-]/g, "") || (own ? cur.verifyToken : "") || crypto.randomBytes(16).toString("hex"),
    token: String(b.token || "").trim() || (own ? cur.token : "") || "", appSecret: String(b.appSecret || "").trim() || (own ? cur.appSecret : "") || "",
    platformApp: false, connectedVia: "manual",
  };
  if (!next.phoneNumberId) return fail(res, "Falta el identificador del número de teléfono");
  if (!next.token) return fail(res, "Falta el token de acceso");
  if (next.verifyToken.length < 8) return fail(res, "El token de verificación tiene que tener al menos 8 caracteres");
  // Se comprueba con Meta antes de guardar: así no se queda guardado algo que no funciona.
  let info;
  try {
    info = await graph(user.orgId, `${next.phoneNumberId}?fields=${PHONE_FIELDS}`, { token: next.token });
  } catch (e) {
    return fail(res, `Meta no acepta estos datos: ${e.message}`, 400);
  }
  // La cuenta (WABA) tiene que suscribir esta app para que lleguen los mensajes al webhook.
  let subscribed = false;
  if (next.wabaId) {
    subscribed = await graph(user.orgId, `${next.wabaId}/subscribed_apps`, { method: "POST", token: next.token }).then(() => true).catch(() => false);
  }
  await storeConnection(user, next, info);
  // Primera sincronización de plantillas (si falla no impide guardar).
  if (next.wabaId) await require("./waTemplates").syncTemplates(user.orgId).catch(() => {});
  res.json({ ok: true, subscribed });
}

// Conexión con un botón (Embedded Signup): la app manda el código de Facebook y los
// identificadores que Meta le pasó al terminar (número y cuenta). El servidor cambia el código
// por un token de la empresa, registra el número en la API, suscribe la app a su cuenta y lo
// guarda. coexistence: el número sigue también en la app WhatsApp Business del móvil.
async function embeddedSignup(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  if (!user.isAdmin) return fail(res, "Solo un administrador puede conectar WhatsApp", 403);
  const m = META();
  if (!m.appId || !m.appSecret || !m.configId) return fail(res, "La conexión con un botón no está disponible: configura la app de Meta de la plataforma.", 409);
  const b = req.body || {};
  const code = clip(b.code, 1000);
  const wabaId = digits(b.wabaId).slice(0, 30);
  if (!code || !wabaId) return fail(res, "Faltan datos de Meta. Vuelve a pulsar «Conectar con Facebook».");
  // 1) Código → token de la empresa (de larga duración).
  const tr = await fetch(`${GRAPH}/${VERSION}/oauth/access_token?${new URLSearchParams({ client_id: m.appId, client_secret: m.appSecret, code })}`);
  const tk = await tr.json().catch(() => ({}));
  if (!tr.ok || !tk.access_token) return fail(res, `Meta no aceptó la conexión: ${explain(tk.error || {}) || tr.status}`, 400);
  const token = tk.access_token;
  // 2) Si Meta no nos dijo el número (cuenta sin número todavía), el primero de la cuenta.
  let phone = digits(b.phoneNumberId).slice(0, 30);
  if (!phone) {
    const list = await graph(user.orgId, `${wabaId}/phone_numbers?fields=id`, { token }).catch(() => ({}));
    phone = digits(list.data?.[0]?.id);
    if (!phone) return fail(res, "Tu cuenta de WhatsApp Business aún no tiene ningún número. Termina de añadirlo en Meta y vuelve a conectar.", 409);
  }
  // Antes de tocar nada en Meta: que el número no sea ya de otra empresa de la plataforma.
  await assertFree(user.orgId, [["phone", phone], ["waba", wabaId]]);
  // 3) Registrar el número en la API (no hace falta en coexistencia con la app del móvil).
  const pin = String(crypto.randomInt(100000, 1000000));
  if (!b.coexistence) {
    await graph(user.orgId, `${phone}/register`, { method: "POST", token, body: { messaging_product: "whatsapp", pin } }).catch((e) => {
      // Ya registrado (p. ej. reconexión): seguimos; otro error se avisa.
      if (!/already|registrad/i.test(`${e.meta?.message || ""} ${e.message}`)) throw httpError(`No se pudo registrar el número en WhatsApp: ${e.message}`, 400);
    });
  }
  // 4) Suscribir la app de la plataforma a su cuenta (para recibir sus mensajes).
  await graph(user.orgId, `${wabaId}/subscribed_apps`, { method: "POST", token }).catch((e) => { throw httpError(`No se pudo activar la recepción de mensajes: ${e.message}`, 400); });
  const info = await graph(user.orgId, `${phone}?fields=${PHONE_FIELDS}`, { token });
  await storeConnection(user, {
    phoneNumberId: phone, wabaId, appId: m.appId, token, appSecret: "", verifyToken: "", platformApp: true,
    connectedVia: b.coexistence ? "embedded-coexistence" : "embedded", pin: b.coexistence ? "" : pin,
  }, info);
  await require("./waTemplates").syncTemplates(user.orgId).catch(() => {});
  res.json({ ok: true, displayPhone: info.display_phone_number || "", verifiedName: info.verified_name || "" });
}

// Desconectar WhatsApp de la empresa (deja de recibir y enviar; los chats se quedan).
async function disconnect(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  if (!user.isAdmin) return fail(res, "Solo un administrador puede desconectar WhatsApp", 403);
  const cur = await settings(user.orgId, true);
  if (cur.platformApp && cur.wabaId && cur.token) {
    await graph(user.orgId, `${cur.wabaId}/subscribed_apps`, { method: "DELETE", token: cur.token }).catch(() => {});
  }
  const batch = db.batch();
  for (const [kind, id] of [["phone", cur.phoneNumberId], ["waba", cur.wabaId], ["verify", cur.verifyToken]]) if (id) batch.delete(INDEX().doc(idxKey(kind, id)));
  const FV = admin.firestore.FieldValue;
  batch.set(SETTINGS(user.orgId), { token: FV.delete(), appSecret: FV.delete(), pin: FV.delete(), disconnectedAt: Date.now(), updatedBy: norm(user.email) }, { merge: true });
  await batch.commit();
  resetSettingsCache(user.orgId);
  idxCache.clear();
  res.json({ ok: true });
}

/* ------------------------------------------------------------------ perfil y estado del número */

const PROFILE_FIELDS = "about,address,description,email,profile_picture_url,websites,vertical";
const VERTICALS = ["UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN", "EVENT_PLAN", "FINANCE", "GROCERY", "GOVT", "HOTEL", "HEALTH", "NONPROFIT", "PROF_SERVICES", "RETAIL", "TRAVEL", "RESTAURANT", "NOT_A_BIZ"];

// GET /whatsapp/profile — el perfil de empresa que ven los clientes en WhatsApp.
async function getProfile(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const s = await settings(user.orgId);
  if (!s.phoneNumberId || !s.token) return fail(res, "Conecta primero el número", 409);
  const out = await graph(user.orgId, `${s.phoneNumberId}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`);
  res.json({ ok: true, admin: user.isAdmin, profile: out.data?.[0] || {}, verticals: VERTICALS });
}

// POST /whatsapp/profile { about, description, address, email, websites[], vertical, photo?: { data, mime } }
async function saveProfile(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  if (!user.isAdmin) return fail(res, "Solo un administrador puede cambiar el perfil de WhatsApp", 403);
  const s = await settings(user.orgId);
  if (!s.phoneNumberId || !s.token) return fail(res, "Conecta primero el número", 409);
  const b = req.body || {};
  const email = clip(b.email, 128);
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return fail(res, "El email no es válido");
  const websites = (Array.isArray(b.websites) ? b.websites : []).map((w) => clip(w, 256)).filter(Boolean).slice(0, 2);
  if (websites.some((w) => !/^https?:\/\//i.test(w))) return fail(res, "Las webs tienen que empezar por https://");
  const body = {
    messaging_product: "whatsapp", about: clip(b.about, 139), description: clip(b.description, 512), address: clip(b.address, 256),
    email, websites, ...(VERTICALS.includes(b.vertical) ? { vertical: b.vertical } : {}),
  };
  if (b.photo?.data) {
    const mime = ["image/jpeg", "image/png"].includes(b.photo.mime) ? b.photo.mime : "";
    if (!mime) return fail(res, "La foto tiene que ser JPG o PNG");
    const f = fileFromBody({ ...b.photo, mime, name: `perfil.${mime.split("/")[1]}` });
    if (f.buf.length > 5 * 1024 * 1024) return fail(res, "La foto tiene que pesar menos de 5 MB");
    body.profile_picture_handle = await require("./waTemplates").uploadHandle(user.orgId, f);
  }
  await graph(user.orgId, `${s.phoneNumberId}/whatsapp_business_profile`, { method: "POST", body });
  res.json({ ok: true });
}

// GET /whatsapp/health — estado del número y de la cuenta en Meta (como «Comprobar estado de la red»).
async function health(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const s = await settings(user.orgId);
  if (!s.phoneNumberId || !s.token) return fail(res, "Conecta primero el número", 409);
  const phone = await graph(user.orgId, `${s.phoneNumberId}?fields=display_phone_number,verified_name,status,quality_rating,messaging_limit_tier,name_status,code_verification_status,throughput,health_status`);
  const waba = s.wabaId ? await graph(user.orgId, `${s.wabaId}?fields=name,account_review_status,business_verification_status,health_status`).catch(() => ({})) : {};
  // Lo que bloquea enviar, en cristiano (Meta lo devuelve en health_status.entities[].errors).
  const problems = [];
  for (const e of [...(phone.health_status?.entities || []), ...(waba.health_status?.entities || [])]) {
    for (const x of e.errors || []) problems.push(clip(x.error_description || x.possible_solution || x.error_code, 300));
  }
  await SETTINGS(user.orgId).set({ quality: clip(phone.quality_rating, 20), messagingLimit: clip(phone.messaging_limit_tier, 30), checkedAt: Date.now() }, { merge: true });
  resetSettingsCache(user.orgId);
  res.json({
    ok: true,
    phone: {
      number: phone.display_phone_number || "", name: phone.verified_name || "", status: phone.status || "", quality: phone.quality_rating || "",
      limit: phone.messaging_limit_tier || "", nameStatus: phone.name_status || "", verification: phone.code_verification_status || "",
      throughput: phone.throughput?.level || "", canSend: phone.health_status?.can_send_message || "",
    },
    account: { name: waba.name || "", review: waba.account_review_status || "", businessVerification: waba.business_verification_status || "", canSend: waba.health_status?.can_send_message || "" },
    problems: [...new Set(problems)],
    links: s.wabaId ? {
      manager: `https://business.facebook.com/wa/manage/home/?waba_id=${s.wabaId}`,
      payments: `https://business.facebook.com/billing_hub/accounts/details/?asset_id=${s.wabaId}`,
    } : null,
  });
}

// Empresas con WhatsApp conectado (para el cron).
async function connectedOrgs() {
  const snap = await INDEX().where("kind", "==", "phone").get();
  return [...new Set(snap.docs.map((d) => d.data().orgId).filter(Boolean))];
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
  getSettings: route(getSettings), saveSettings: route(saveSettings), embeddedSignup: route(embeddedSignup), disconnect: route(disconnect),
  getProfile: route(getProfile), saveProfile: route(saveProfile), health: route(health),
  // para waAuto / waTemplates
  route, staff, settings, graph, deliver, storeOutbound, logEvent, stageText, sendAuto, sendAutoText, openChat, findContact,
  uploadMedia, fileFromBody, saveCopy, toWaId, clip, digits, fail, httpError, msgDocId, CHATS, SETTINGS, INDEX, WINDOW_MS, KIND_OF, GRAPH, VERSION,
  resetSettingsCache, indexOrg, connectedOrgs,
  // para las pruebas
  processChange, parseInbound,
};
