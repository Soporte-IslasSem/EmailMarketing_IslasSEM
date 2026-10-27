// Plantillas de Meta y lo que se envía con ellas, por empresa (organizations/{org}/…):
// - Sincronización (waTemplates/<nombre>__<idioma>): cada 5 min desde el cron, al guardar los
//   ajustes, con el botón "Sincronizar" y al instante cuando Meta avisa por el webhook de que
//   una plantilla se ha aprobado, rechazado, pausado…
// - Crear (se manda a revisión de Meta) y borrar plantillas. Solo administradores.
// - Enviar una plantilla en un chat (fuera de la ventana de 24 h) o a un número nuevo
//   (iniciar conversación).
// - Difusiones (waBroadcasts/<id> + recipients/<wa_id>): una plantilla a muchos contactos (por
//   tipo/lista del CRM, por columna de embudo o por etiqueta), al momento o programada. El
//   cron las envía por tandas; quien escribió BAJA no la recibe. Contadores de enviados,
//   entregados, leídos y fallidos.
const { admin, db } = require("./firebase");
const { norm } = require("./link");
const { orgRef } = require("./tenant");
const wa = require("./whatsapp");
const cfgLib = require("./waConfig");

const TPL = (orgId) => orgRef(orgId).collection("waTemplates");
const BC = (orgId) => orgRef(orgId).collection("waBroadcasts");
const { clip, digits, fail, httpError } = wa;
const VAR = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const varsOf = (text) => [...new Set([...String(text || "").matchAll(VAR)].map((m) => m[1]))];
const tplId = (name, lang) => `${name}__${lang}`.replace(/[^A-Za-z0-9_-]/g, "_");
const inc = (n) => admin.firestore.FieldValue.increment(n);
// Firestore no admite listas dentro de listas, y Meta manda así los ejemplos de las variables
// (example.body_text: [["Ana", "IA"]]). Para enviar no hacen falta: se guardan sin ellos.
const storable = (components) => (Array.isArray(components) ? components : []).map((c) => {
  const { example: _e, ...rest } = c || {};
  return JSON.parse(JSON.stringify(rest, (k, v) => (Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? x.join(", ") : x)) : v)));
});

/* ------------------------------------------------------------------ sincronizar */

async function syncTemplates(orgId) {
  const s = await wa.settings(orgId, true);
  if (!s.wabaId || !s.token) return { skipped: "falta el WABA ID" };
  const all = [];
  let path = `${s.wabaId}/message_templates?fields=id,name,language,status,category,components,rejected_reason,parameter_format,quality_score&limit=100`;
  for (let i = 0; path && i < 30; i++) {
    const out = await wa.graph(orgId, path);
    all.push(...(out.data || []));
    const next = out.paging?.next || "";
    path = next ? next.replace(/^https?:\/\/[^/]+\/v[\d.]+\//, "") : "";
  }
  const now = Date.now();
  const keep = new Set();
  const writes = all.map((t) => {
    const id = tplId(t.name, t.language);
    keep.add(id);
    return [TPL(orgId).doc(id), {
      orgId, metaId: String(t.id || ""), name: t.name, language: t.language, status: t.status || "",
      category: t.category || "", components: storable(t.components), paramFormat: t.parameter_format || "POSITIONAL",
      rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : "",
      quality: t.quality_score?.score || "", syncedAt: now,
    }];
  });
  const old = await TPL(orgId).get();
  const dels = old.docs.filter((d) => !keep.has(d.id)).map((d) => d.ref);
  const ops = [...writes.map(([ref, data]) => (b) => b.set(ref, data)), ...dels.map((ref) => (b) => b.delete(ref))];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  await wa.SETTINGS(orgId).set({ templatesSyncedAt: now }, { merge: true });
  wa.resetSettingsCache(orgId);
  return { total: all.length, removed: dels.length };
}

// Aviso de Meta: plantilla aprobada / rechazada / pausada… o cambio de calidad.
async function templateEvent(orgId, field, v) {
  const name = v.message_template_name;
  const lang = v.message_template_language;
  if (!name || !lang) return;
  const ref = TPL(orgId).doc(tplId(name, lang));
  if (field === "message_template_quality_update") return ref.set({ quality: clip(v.new_quality_score, 20) }, { merge: true });
  await ref.set({ name, language: lang, status: clip(v.event, 30), rejectedReason: v.reason && v.reason !== "NONE" ? clip(v.reason, 200) : "", orgId }, { merge: true });
}

/* ------------------------------------------------------------------ crear / borrar */

// Archivo de ejemplo para la cabecera (imagen, vídeo, documento): Meta lo pide subido con su
// "subida reanudable" (necesita el id de la app; se averigua con el token).
async function uploadHandle(orgId, f) {
  const s = await wa.settings(orgId, true);
  let appId = s.appId;
  if (!appId) {
    appId = (await wa.graph(orgId, "app").catch(() => ({})))?.id;
    if (!appId) throw httpError("No se pudo averiguar el identificador de la app de Meta. Escríbelo en Ajustes › Conexión (App ID).", 409);
    await wa.SETTINGS(orgId).set({ appId: String(appId) }, { merge: true });
    wa.resetSettingsCache(orgId);
  }
  const sess = await wa.graph(orgId, `${appId}/uploads?file_name=${encodeURIComponent(f.filename)}&file_length=${f.buf.length}&file_type=${encodeURIComponent(f.mime)}`, { method: "POST" });
  const r = await fetch(`${wa.GRAPH}/${wa.VERSION}/${sess.id}`, { method: "POST", headers: { Authorization: `OAuth ${s.token}`, file_offset: "0" }, body: f.buf });
  const out = await r.json().catch(() => ({}));
  if (!out.h) throw httpError(`Meta no aceptó el archivo de ejemplo: ${out.error?.message || r.status}`, 502);
  return out.h;
}

const MEDIA_FORMATS = ["IMAGE", "VIDEO", "DOCUMENT"];

async function createTemplate(req, res) {
  const user = await wa.staff(req, res);
  if (!user) return;
  if (!user.isAdmin) return fail(res, "Solo un administrador puede crear plantillas", 403);
  const orgId = user.orgId;
  const s = await wa.settings(orgId, true);
  if (!s.wabaId) return fail(res, "Falta el WABA ID en Ajustes › Conexión", 409);
  const b = req.body || {};
  const name = String(b.name || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!/^[a-z0-9_]{1,512}$/.test(name)) return fail(res, "Nombre no válido: solo minúsculas, números y guiones bajos (p. ej. bienvenida_curso)");
  const language = /^[a-z]{2,3}(_[A-Z]{2})?$/.test(b.language) ? b.language : "";
  if (!language) return fail(res, "Elige el idioma");
  const category = ["MARKETING", "UTILITY"].includes(b.category) ? b.category : "";
  if (!category) return fail(res, "Elige la categoría");
  const components = [];

  const h = b.header || {};
  if (h.format === "TEXT") {
    const text = clip(h.text, 60);
    if (!text) return fail(res, "Escribe el texto de la cabecera (máx. 60 caracteres)");
    const vs = varsOf(text);
    if (vs.length > 1) return fail(res, "La cabecera solo admite una variable");
    if (vs.length && !clip(h.example, 60)) return fail(res, "Escribe un ejemplo para la variable de la cabecera");
    components.push({ type: "HEADER", format: "TEXT", text, ...(vs.length ? { example: { header_text: [clip(h.example, 60)] } } : {}) });
  } else if (MEDIA_FORMATS.includes(h.format)) {
    const f = wa.fileFromBody(h.file);
    components.push({ type: "HEADER", format: h.format, example: { header_handle: [await uploadHandle(orgId, f)] } });
  }

  const body = String(b.body?.text || "").replace(/\r/g, "").trim();
  if (!body) return fail(res, "Escribe el texto del mensaje");
  if (body.length > 1024) return fail(res, "El mensaje pasa de 1024 caracteres");
  const bv = varsOf(body);
  const positional = bv.every((v) => /^\d+$/.test(v));
  if (positional && bv.some((v, i) => Number(v) !== i + 1)) return fail(res, "Las variables tienen que ir en orden: {{1}}, {{2}}, {{3}}…");
  if (/^\s*\{\{[^}]+\}\}/.test(body) || /\{\{[^}]+\}\}\s*[.!?]?\s*$/.test(body)) return fail(res, "Meta no admite que el mensaje empiece o termine con una variable: añade texto antes/después");
  const examples = (Array.isArray(b.body?.examples) ? b.body.examples : []).map((x) => clip(x, 200));
  if (bv.length && (examples.length < bv.length || examples.slice(0, bv.length).some((x) => !x))) return fail(res, "Escribe un ejemplo para cada variable del mensaje");
  components.push({
    type: "BODY", text: body,
    ...(bv.length ? positional ? { example: { body_text: [examples.slice(0, bv.length)] } }
      : { example: { body_text_named_params: bv.map((k, i) => ({ param_name: k, example: examples[i] })) } } : {}),
  });

  const footer = clip(b.footer, 60);
  if (footer) components.push({ type: "FOOTER", text: footer });

  const buttons = [];
  for (const x of (Array.isArray(b.buttons) ? b.buttons : []).slice(0, 10)) {
    const text = clip(x.text, 25);
    if (!text) return fail(res, "Todos los botones necesitan un texto");
    if (x.type === "QUICK_REPLY") buttons.push({ type: "QUICK_REPLY", text });
    else if (x.type === "URL") {
      const url = clip(x.url, 2000);
      if (!/^https?:\/\//.test(url)) return fail(res, `El botón «${text}» necesita una dirección web que empiece por https://`);
      const dyn = /\{\{1\}\}$/.test(url);
      if (dyn && !clip(x.example, 2000)) return fail(res, `Escribe un ejemplo de dirección completa para el botón «${text}»`);
      buttons.push({ type: "URL", text, url, ...(dyn ? { example: [clip(x.example, 2000)] } : {}) });
    } else if (x.type === "PHONE_NUMBER") {
      const phone = digits(x.phone);
      if (phone.length < 8) return fail(res, `El botón «${text}» necesita un teléfono con prefijo de país`);
      buttons.push({ type: "PHONE_NUMBER", text, phone_number: `+${phone}` });
    }
  }
  if (buttons.length) components.push({ type: "BUTTONS", buttons });

  const out = await wa.graph(orgId, `${s.wabaId}/message_templates`, {
    method: "POST", body: { name, language, category, components, ...(bv.length && !positional ? { parameter_format: "NAMED" } : {}) },
  });
  await TPL(orgId).doc(tplId(name, language)).set({
    orgId, metaId: String(out.id || ""), name, language, status: out.status || "PENDING", category: out.category || category,
    components: storable(components), paramFormat: bv.length && !positional ? "NAMED" : "POSITIONAL", rejectedReason: "", quality: "", syncedAt: Date.now(),
    createdBy: norm(user.email),
  });
  res.json({ ok: true, status: out.status || "PENDING" });
}

async function deleteTemplate(req, res) {
  const user = await wa.staff(req, res);
  if (!user) return;
  if (!user.isAdmin) return fail(res, "Solo un administrador puede borrar plantillas", 403);
  const s = await wa.settings(user.orgId, true);
  const ref = TPL(user.orgId).doc(clip(req.body?.id, 600) || "x");
  const t = (await ref.get()).data();
  if (!t) return fail(res, "Esa plantilla no existe", 404);
  await wa.graph(user.orgId, `${s.wabaId}/message_templates?name=${encodeURIComponent(t.name)}${t.metaId ? `&hsm_id=${t.metaId}` : ""}`, { method: "DELETE" });
  await ref.delete();
  res.json({ ok: true });
}

async function sync(req, res) {
  const user = await wa.staff(req, res);
  if (!user) return;
  res.json({ ok: true, ...(await syncTemplates(user.orgId)) });
}

/* ------------------------------------------------------------------ enviar */

async function approvedTemplate(orgId, name, language) {
  const t = (await TPL(orgId).doc(tplId(clip(name, 512), clip(language, 10))).get()).data();
  if (!t) throw httpError("Esa plantilla no existe. Pulsa «Sincronizar» en Plantillas.", 404);
  if (t.status !== "APPROVED") throw httpError(`La plantilla «${t.name}» no está aprobada por Meta (estado: ${t.status}).`, 409);
  return t;
}

// Variables de contacto que se pueden usar en los valores: {nombre}, {empresa}…
function fillVars(v, ctx = {}) {
  return String(v ?? "").replace(/\{(nombre|apellidos|nombre_completo|empresa|email|telefono)\}/gi, (_, k) => {
    const key = k.toLowerCase();
    const full = `${ctx.firstName || ""} ${ctx.lastName || ""}`.trim();
    return ({ nombre: ctx.firstName || full || ctx.name || "", apellidos: ctx.lastName || "", nombre_completo: full || ctx.name || "", empresa: ctx.company || "", email: ctx.email || "", telefono: ctx.phone || "" })[key] || "";
  }).trim();
}

// Componentes de envío + el texto tal como le llega al cliente (para guardarlo en el chat).
function build(t, params = {}, media, ctx) {
  const comps = [];
  const named = t.paramFormat === "NAMED";
  const comp = (type) => (t.components || []).find((c) => c.type === type);
  const values = (keys, list, where) => keys.map((k, i) => {
    const val = fillVars(Array.isArray(list) ? list[i] : list?.[k], ctx);
    if (!val) throw httpError(`Falta el valor de la variable {{${k}}} (${where})`, 400);
    return val;
  });
  const sub = (text, keys, vals) => keys.reduce((acc, k, i) => acc.split(`{{${k}}}`).join(vals[i]), String(text || ""));
  let head = "";
  const h = comp("HEADER");
  if (h?.format === "TEXT") {
    const keys = varsOf(h.text);
    const vals = values(keys, params.header, "cabecera");
    if (keys.length) comps.push({ type: "header", parameters: keys.map((k, i) => ({ type: "text", text: vals[i], ...(named ? { parameter_name: k } : {}) })) });
    head = sub(h.text, keys, vals);
  } else if (MEDIA_FORMATS.includes(h?.format)) {
    if (!media?.id) throw httpError("Esta plantilla lleva un archivo en la cabecera: adjúntalo", 400);
    const k = h.format.toLowerCase();
    comps.push({ type: "header", parameters: [{ type: k, [k]: { id: media.id, ...(k === "document" && media.filename ? { filename: media.filename } : {}) } }] });
  }
  const bd = comp("BODY");
  const bkeys = varsOf(bd?.text);
  const bvals = values(bkeys, params.body, "mensaje");
  if (bkeys.length) comps.push({ type: "body", parameters: bkeys.map((k, i) => ({ type: "text", text: bvals[i], ...(named ? { parameter_name: k } : {}) })) });
  const labels = [];
  (comp("BUTTONS")?.buttons || []).forEach((bt, i) => {
    labels.push(bt.text);
    if (bt.type === "URL" && varsOf(bt.url).length) {
      const val = fillVars(params.buttons?.[i], ctx);
      if (!val) throw httpError(`Falta el final de la dirección del botón «${bt.text}»`, 400);
      comps.push({ type: "button", sub_type: "url", index: String(i), parameters: [{ type: "text", text: val }] });
    } else if (bt.type === "FLOW") {
      comps.push({ type: "button", sub_type: "flow", index: String(i), parameters: [{ type: "action", action: { flow_token: "islassem" } }] });
    } else if (bt.type === "COPY_CODE") {
      const val = fillVars(params.buttons?.[i], ctx);
      if (!val) throw httpError("Falta el código del botón «Copiar código»", 400);
      comps.push({ type: "button", sub_type: "copy_code", index: String(i), parameters: [{ type: "coupon_code", coupon_code: val }] });
    }
  });
  const text = [head && `*${head}*`, sub(bd?.text, bkeys, bvals), comp("FOOTER")?.text && `_${comp("FOOTER").text}_`, labels.length ? labels.map((l) => `[${l}]`).join(" ") : ""].filter(Boolean).join("\n\n");
  return { body: { type: "template", template: { name: t.name, language: { code: t.language }, ...(comps.length ? { components: comps } : {}) } }, text };
}

// Crea el chat si aún no existe (al escribir nosotros primero).
async function ensureChat(orgId, waId, { contact, archived = false, assignee } = {}) {
  const ref = wa.CHATS(orgId).doc(waId);
  const snap = await ref.get();
  if (snap.exists) return snap.data();
  const cfg = await cfgLib.getConfig(orgId);
  const c = contact || (await wa.findContact(orgId, waId));
  const data = {
    orgId, waId, phone: `+${waId}`, profileName: "", contactId: c?.id || "", contactName: c?.name || "",
    assigneeEmail: assignee?.email || "", assigneeName: assignee?.name || "", teamId: "", tags: [], notes: "",
    starred: false, blocked: false, optOut: false, unread: 0, archived, lastInboundAt: 0, lastAt: Date.now(), lastText: "", lastDir: "out",
    closingDueAt: 0, createdAt: Date.now(), updatedAt: Date.now(),
    ...(archived ? { funnelId: "", stageId: "" } : { ...cfgLib.firstStage(cfg), stageAt: Date.now() }),
  };
  await ref.set(data);
  return data;
}

// POST /whatsapp/send-template { chatId | phone, contactId?, name, language, params, file? }
async function sendTemplate(req, res) {
  const user = await wa.staff(req, res);
  if (!user) return;
  const b = req.body || {};
  const orgId = user.orgId;
  const t = await approvedTemplate(orgId, b.name, b.language);
  const cfg = await cfgLib.getConfig(orgId);
  let waId = digits(b.chatId);
  let contact = null;
  if (!waId) {
    if (b.contactId) {
      const cd = (await db.collection("contacts").doc(clip(b.contactId, 80)).get()).data();
      if (!cd || cd.orgId !== orgId) return fail(res, "Ese contacto no existe", 404);
      contact = { id: clip(b.contactId, 80), name: `${cd.firstName || ""} ${cd.lastName || ""}`.trim(), ...cd };
      waId = wa.toWaId(b.phone || cd.whatsapp || cd.phone, cfg.defaultCountry);
    } else waId = wa.toWaId(b.phone, cfg.defaultCountry);
    if (!waId) return fail(res, "Número no válido. Escríbelo con prefijo de país, p. ej. +34 600 000 000");
  }
  const chat = (await wa.CHATS(orgId).doc(waId).get()).data();
  if (chat?.blocked) return fail(res, "Este número está bloqueado. Desbloquéalo para escribirle.", 409);
  let file = null;
  let media = null;
  const h = (t.components || []).find((c) => c.type === "HEADER");
  if (MEDIA_FORMATS.includes(h?.format)) {
    file = wa.fileFromBody(b.file);
    media = { id: await wa.uploadMedia(orgId, file.buf, file.mime, file.filename), filename: file.filename };
  }
  const linked = chat?.contactId ? (await db.collection("contacts").doc(chat.contactId).get()).data() : null;
  const ctx = contact || (linked?.orgId === orgId ? linked : null) || { name: chat?.profileName || "" };
  const { body, text } = build(t, b.params, media, ctx);
  const d = await wa.deliver(orgId, waId, body);
  await ensureChat(orgId, d.waId, { contact: contact && { id: contact.id, name: contact.name }, assignee: { email: norm(user.email), name: user.name || user.email } });
  const path = file ? await wa.saveCopy(orgId, d.waId, d.wamid, file) : "";
  const id = await wa.storeOutbound(orgId, d.waId, d.wamid, {
    type: "template", text, template: { name: t.name, language: t.language },
    ...(file ? { media: { mime: file.mime, filename: file.filename, path, size: file.buf.length } } : {}),
  }, user, chat?.archived ? { archived: false } : {});
  res.json({ ok: true, chatId: d.waId, id });
}

/* ------------------------------------------------------------------ difusiones */

async function createBroadcast(req, res) {
  const user = await wa.staff(req, res);
  if (!user) return;
  if (!user.isAdmin) return fail(res, "Solo un administrador puede hacer difusiones", 403);
  const orgId = user.orgId;
  const b = req.body || {};
  const name = clip(b.name, 100);
  if (!name) return fail(res, "Ponle un nombre a la difusión");
  const t = await approvedTemplate(orgId, b.template?.name, b.template?.language);
  const cfg = await cfgLib.getConfig(orgId);
  const a = b.audience || {};

  // Destinatarios (sin repetir número). Quien pidió BAJA o está bloqueado, fuera.
  const map = new Map();
  const add = (waId, ctx) => { if (waId && !map.has(waId)) map.set(waId, ctx); };
  const types = (Array.isArray(a.types) ? a.types : []).map((x) => clip(x, 60)).filter(Boolean);
  const ids = new Set((Array.isArray(a.contactIds) ? a.contactIds : []).map((x) => clip(x, 80)));
  if (types.length || ids.size) {
    const snap = await db.collection("contacts").where("orgId", "==", orgId).get();
    for (const d of snap.docs) {
      const c = d.data();
      if (c.deleted) continue;
      const ct = Array.isArray(c.clientTypes) ? c.clientTypes : c.clientType ? [c.clientType] : [];
      if (!ids.has(d.id) && !(a.allContacts === true) && !ct.some((x) => types.includes(x))) continue;
      add(wa.toWaId(c.whatsapp || c.phone, cfg.defaultCountry), { contactId: d.id, firstName: c.firstName || "", lastName: c.lastName || "", company: c.company || "", email: c.email || "", phone: c.whatsapp || c.phone || "" });
    }
  }
  const stage = cfgLib.parseStage(cfg, a.stage);
  const tagIds = (Array.isArray(a.tagIds) ? a.tagIds : []).filter((x) => cfg.tags.some((t2) => t2.id === x));
  if (stage || tagIds.length) {
    const snap = stage ? await wa.CHATS(orgId).where("funnelId", "==", stage.funnelId).get() : await wa.CHATS(orgId).get();
    for (const d of snap.docs) {
      const c = d.data();
      if (stage && (c.stageId !== stage.stageId || c.archived)) continue;
      if (tagIds.length && !(c.tags || []).some((x) => tagIds.includes(x))) continue;
      add(d.id, { contactId: c.contactId || "", firstName: "", lastName: "", name: c.contactName || c.profileName || "", company: "", email: "", phone: c.phone || "" });
    }
  }
  const optedOut = new Set((await wa.CHATS(orgId).where("optOut", "==", true).get()).docs.map((d) => d.id));
  const blocked = new Set((await wa.CHATS(orgId).where("blocked", "==", true).get()).docs.map((d) => d.id));
  const list = [...map.entries()].filter(([w]) => !optedOut.has(w) && !blocked.has(w));
  const skipped = map.size - list.length;
  if (!list.length) return fail(res, map.size ? "Todos los destinatarios pidieron la baja o están bloqueados" : "No hay destinatarios con teléfono válido para esa selección");
  if (list.length > 10000) return fail(res, "Máximo 10.000 destinatarios por difusión");

  // Cabecera con archivo: se sube una vez y se reutiliza para todos.
  let media = null;
  const h = (t.components || []).find((c) => c.type === "HEADER");
  if (MEDIA_FORMATS.includes(h?.format)) {
    const f = wa.fileFromBody(b.file);
    media = { id: await wa.uploadMedia(orgId, f.buf, f.mime, f.filename), filename: f.filename };
  }
  // Prueba con el primero: si faltan variables, se avisa ya y no a mitad de envío.
  build(t, b.params, media, list[0][1]);

  const sendAt = Number(b.sendAt) > Date.now() ? Number(b.sendAt) : Date.now();
  const ref = BC(orgId).doc();
  await ref.set({
    orgId, name, template: { name: t.name, language: t.language, category: t.category }, params: b.params || {},
    media, audience: { types, contactIds: [...ids].slice(0, 500), stage: stage ? a.stage : "", tagIds, allContacts: a.allContacts === true },
    total: list.length, skipped, sent: 0, delivered: 0, read: 0, failed: 0,
    status: sendAt > Date.now() + 30e3 ? "scheduled" : "queued", sendAt, lockUntil: 0,
    createdAt: Date.now(), createdBy: norm(user.email), createdByName: clip(user.name || user.email, 120),
  });
  for (let i = 0; i < list.length; i += 450) {
    const batch = db.batch();
    for (const [w, ctx] of list.slice(i, i + 450)) batch.set(ref.collection("recipients").doc(w), { waId: w, ...ctx, status: "pending" });
    await batch.commit();
  }
  res.json({ ok: true, id: ref.id, total: list.length, skipped });
  if (sendAt <= Date.now() + 30e3) processBroadcasts(orgId).catch((e) => console.error("[whatsapp] difusión:", e.message || e));
}

async function cancelBroadcast(req, res) {
  const user = await wa.staff(req, res);
  if (!user) return;
  if (!user.isAdmin) return fail(res, "Solo un administrador puede cancelar difusiones", 403);
  const ref = BC(user.orgId).doc(clip(req.body?.id, 60) || "x");
  const bc = (await ref.get()).data();
  if (!bc) return fail(res, "Esa difusión no existe", 404);
  if (!["scheduled", "queued", "sending"].includes(bc.status)) return fail(res, "Esa difusión ya terminó");
  await ref.update({ status: "cancelled", finishedAt: Date.now() });
  res.json({ ok: true });
}

// Envía la siguiente tanda de cada difusión pendiente (cron + al crearla).
async function processBroadcasts(orgId) {
  const now = Date.now();
  const snap = await BC(orgId).where("status", "in", ["scheduled", "queued", "sending"]).get();
  let sent = 0;
  for (const d of snap.docs) {
    const bc = d.data();
    if (bc.sendAt > now) continue;
    // Candado de 2 min: dos crons a la vez no envían la misma tanda.
    const got = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(d.ref)).data();
      if (!cur || !["scheduled", "queued", "sending"].includes(cur.status) || (cur.lockUntil || 0) > Date.now()) return false;
      tx.update(d.ref, { status: "sending", lockUntil: Date.now() + 120e3, ...(cur.startedAt ? {} : { startedAt: Date.now() }) });
      return true;
    });
    if (!got) continue;
    try {
      sent += await sendBatch(orgId, d.ref, bc);
    } finally {
      await d.ref.update({ lockUntil: 0 }).catch(() => {});
    }
  }
  return sent;
}

async function sendBatch(orgId, ref, bc) {
  let t;
  try {
    t = await approvedTemplate(orgId, bc.template.name, bc.template.language);
  } catch (e) {
    await ref.update({ status: "failed", error: e.message, finishedAt: Date.now() });
    return 0;
  }
  const pend = await ref.collection("recipients").where("status", "==", "pending").limit(150).get();
  if (pend.empty) {
    await ref.update({ status: "done", finishedAt: Date.now() });
    return 0;
  }
  let ok = 0;
  const one = async (r) => {
    const ctx = r.data();
    try {
      const { body, text } = build(t, bc.params, bc.media, ctx);
      const dlv = await wa.deliver(orgId, r.id, body);
      await ensureChat(orgId, dlv.waId, { contact: ctx.contactId ? { id: ctx.contactId, name: `${ctx.firstName || ""} ${ctx.lastName || ""}`.trim() || ctx.name || "" } : null, archived: true });
      await wa.storeOutbound(orgId, dlv.waId, dlv.wamid, { type: "template", text, template: { name: t.name, language: t.language }, broadcastId: ref.id }, { auto: true, name: `Difusión «${bc.name}»` });
      await r.ref.update({ status: "sent", wamid: dlv.wamid, at: Date.now() });
      await ref.update({ sent: inc(1) });
      ok++;
    } catch (e) {
      await r.ref.update({ status: "failed", error: clip(e.message, 300), at: Date.now() });
      await ref.update({ failed: inc(1) });
      // Token caducado o cuenta restringida: se para la difusión en vez de fallar todos.
      if (e.meta && [190, 131031, 368].includes(Number(e.meta.code))) throw Object.assign(e, { stop: true });
    }
  };
  try {
    const docs = pend.docs;
    for (let i = 0; i < docs.length; i += 5) {
      const cur = (await ref.get()).data();
      if (cur?.status === "cancelled") return ok;
      await Promise.all(docs.slice(i, i + 5).map(one));
    }
  } catch (e) {
    if (e.stop) await ref.update({ status: "failed", error: clip(e.message, 300), finishedAt: Date.now() });
    else throw e;
  }
  return ok;
}

module.exports = {
  syncTemplates, templateEvent, processBroadcasts, build, varsOf, uploadHandle,
  sync: wa.route(sync), createTemplate: wa.route(createTemplate), deleteTemplate: wa.route(deleteTemplate),
  sendTemplate: wa.route(sendTemplate), createBroadcast: wa.route(createBroadcast), cancelBroadcast: wa.route(cancelBroadcast),
};
