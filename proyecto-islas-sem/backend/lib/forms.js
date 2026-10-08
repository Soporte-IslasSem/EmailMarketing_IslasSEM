// Formularios públicos: recepción con reCAPTCHA v3 y vinculación a la ficha del cliente.
//
// Hay dos clases de formulario, que funcionan igual:
// - Fijos (sepa, juridicos): los replicados del Bitrix de ISLAS SEM, definidos en la app.
//   Se pueden editar en el constructor: la versión editada se guarda en crmForms con el
//   mismo id y sustituye a la original.
// - Creados en CRM › Formularios (constructor): colección crmForms/{id}.
//
// 1) GET /forms/def/:id: definición pública de un formulario creado/editado (si está activo).
// 2) GET /forms/public: formularios publicados (página de clientela).
// 3) POST /forms/submit: verifica el token de reCAPTCHA (si RECAPTCHA_SECRET está
//    configurado) y guarda el envío en formSubmissions con el Admin SDK.
// 4) processFormSubmissions() (en el cron): cada envío aún sin vincular se cuelga de
//    su negociación/contacto (o crea un prospecto), deja una actividad en el timeline y,
//    si el formulario tiene "lista destino", suscribe el email a esa lista.
//    Cubre también envíos antiguos escritos directamente desde el navegador.
const { admin, db } = require("./firebase");
const { DEFAULT_ORG_ID, norm, resolvePerson, addActivity } = require("./link");
const { fireWebhook } = require("./webhooks");

const FORM_LABEL = { sepa: "Orden de Domiciliación SEPA", juridicos: "Datos Jurídicos del Representante" };
const MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5);
const FIELD_TYPES = new Set(["text", "email", "tel", "number", "date", "textarea", "select", "check"]);
const MAPS = new Set(["email", "firstName", "lastName", "phone", "company"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const HEX = /^#[0-9a-f]{6}$/i;

async function verifyRecaptcha(token, ip) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: "falta token" };
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.append("remoteip", ip);
  const r = await fetch("https://www.google.com/recaptcha/api/siteverify", { method: "POST", body });
  const data = await r.json();
  if (!data.success) return { ok: false, reason: (data["error-codes"] || []).join(",") || "inválido" };
  if (typeof data.score === "number" && data.score < MIN_SCORE) return { ok: false, reason: `score ${data.score}` };
  return { ok: true, score: data.score };
}

// Formulario guardado en crmForms (creado, o versión editada de SEPA/Jurídicos).
// null si no existe; { active: false, ... } si está desactivado.
async function loadCustomForm(id) {
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const snap = await db.collection("crmForms").doc(id).get().catch(() => null);
  if (!snap?.exists) return null;
  const f = snap.data();
  const fields = (Array.isArray(f.fields) ? f.fields : [])
    .filter((x) => x && String(x.k || "").trim())
    .slice(0, 60)
    .map((x) => ({
      k: String(x.k).trim().slice(0, 120),
      type: FIELD_TYPES.has(x.type) ? x.type : "text",
      req: !!x.req,
      ...(x.type === "select" ? { options: (Array.isArray(x.options) ? x.options : []).map((o) => String(o).slice(0, 200)).filter(Boolean).slice(0, 50) } : {}),
      ...(MAPS.has(x.maps) ? { maps: x.maps } : {}),
    }));
  return {
    id: snap.id, orgId: f.orgId || DEFAULT_ORG_ID, active: f.active !== false,
    name: String(f.name || f.title || "Formulario").slice(0, 120),
    title: String(f.title || f.name || "").slice(0, 200),
    desc: String(f.desc ?? f.description ?? "").slice(0, 500),
    btn: String(f.btn || "Enviar").slice(0, 60),
    color: HEX.test(f.color || "") ? f.color : "#1A9190",
    bg: HEX.test(f.bg || "") ? f.bg : "#FFFFFF",
    consentTitle: String(f.consentTitle || "").slice(0, 200),
    successMessage: String(f.successMessage || "").slice(0, 500),
    listId: String(f.listId || "").slice(0, 64),
    fields,
  };
}

// GET /api/forms/def/:id — lo que necesita la página pública para pintar el formulario.
async function formDefinition(req, res) {
  try {
    const f = await loadCustomForm(String(req.params.id || ""));
    if (!f || !f.active) return res.status(404).json({ ok: false, error: "Formulario no encontrado" });
    const { orgId: _o, id: _i, listId: _l, active: _a, ...pub } = f;
    res.set("Cache-Control", "no-store").json({ ok: true, form: pub });
  } catch (e) {
    console.error("[forms/def]", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
}

// GET /api/forms/public — formularios publicados para la página de clientela.
async function publicForms(_req, res) {
  try {
    const snap = await db.collection("crmForms").where("orgId", "==", DEFAULT_ORG_ID).get();
    const saved = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    const out = [];
    for (const [id, label] of [["juridicos", "Solicitud Datos Jurídicos – Representante Legal"], ["sepa", "Orden de Domiciliación SEPA"]]) {
      const o = saved[id];
      if (!o || o.active !== false) out.push({ id, name: o?.name || label });
    }
    snap.docs
      .filter((d) => !FORM_LABEL[d.id] && d.data().active !== false)
      .sort((a, b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0))
      .forEach((d) => out.push({ id: d.id, name: String(d.data().name || d.data().title || "Formulario").slice(0, 120) }));
    res.set("Cache-Control", "no-store").json({ ok: true, forms: out });
  } catch (e) {
    console.error("[forms/public]", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
}

async function submitForm(req, res) {
  try {
    const { formType, dealId, data, recaptchaToken } = req.body || {};
    if (!formType || !data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ ok: false, error: "Formulario no válido" });
    }
    const custom = await loadCustomForm(String(formType));
    // Un formulario desactivado no acepta envíos (tampoco SEPA/Jurídicos si se desactivaron).
    if (custom && !custom.active) return res.status(400).json({ ok: false, error: "Este formulario ya no está disponible" });
    if (!FORM_LABEL[formType] && !custom) return res.status(400).json({ ok: false, error: "Formulario no válido" });

    const check = await verifyRecaptcha(recaptchaToken, req.ip);
    if (!check.ok) return res.status(403).json({ ok: false, error: "Verificación anti-spam fallida" });

    // Solo strings, recortadas: no se acepta nada anidado del navegador.
    const clean = {};
    let extra = {};
    if (custom) {
      // Formularios del constructor: solo los campos definidos, validados aquí (no solo en el navegador).
      const person = {};
      for (const f of custom.fields) {
        const v = String(data[f.k] ?? "").trim().slice(0, 2000);
        if (f.type === "check") {
          if (f.req && v !== "Sí") return res.status(400).json({ ok: false, error: "Debes aceptar el consentimiento" });
          clean[f.k] = v === "Sí" ? "Sí" : "No";
          continue;
        }
        if (f.req && !v) return res.status(400).json({ ok: false, error: `Falta rellenar: ${f.k}` });
        if (v && f.type === "email" && !EMAIL_RE.test(v)) return res.status(400).json({ ok: false, error: `Email no válido: ${f.k}` });
        if (v && f.type === "select" && !f.options.includes(v)) return res.status(400).json({ ok: false, error: `Opción no válida: ${f.k}` });
        clean[f.k] = v;
        if (f.maps && v && !person[f.maps]) person[f.maps] = f.maps === "email" ? norm(v) : v;
      }
      extra = {
        formName: custom.name, fieldOrder: custom.fields.map((f) => f.k), person,
        mapped: custom.fields.some((f) => f.maps), ...(custom.listId ? { listId: custom.listId } : {}),
      };
    } else {
      for (const [k, v] of Object.entries(data).slice(0, 60)) clean[String(k).slice(0, 120)] = String(v ?? "").slice(0, 2000);
    }
    await db.collection("formSubmissions").add({
      orgId: custom?.orgId || DEFAULT_ORG_ID, formType, dealId: String(dealId || "").slice(0, 64), data: clean, ...extra,
      status: "recibido", recaptchaScore: check.score ?? null, createdAt: new Date(),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("[forms/submit]", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
}

// "Lista destino": suscribe el email del formulario a esa lista de Email Marketing.
// No vuelve a suscribir a quien se dio de baja (hay que respetarlo).
async function subscribeToList(listId, email, name, formId) {
  if (!listId || !EMAIL_RE.test(email || "")) return false;
  const listRef = db.collection("lists").doc(listId);
  const list = (await listRef.get()).data();
  if (!list) return false;
  const existing = await db.collection("subscribers").where("email", "==", email).where("listId", "==", listId).limit(1).get();
  if (!existing.empty) return false;
  const ref = await db.collection("subscribers").add({
    email, name: name || "", listId, userId: list.userId, status: "subscribed", source: "crm-form", formId,
    createdAt: new Date(), confirmedAt: Date.now(),
  });
  await listRef.update({ subscribersCount: admin.firestore.FieldValue.increment(1) });
  fireWebhook(listId, "subscribe", { email, subscriberId: ref.id, source: "crm-form", formId });
  return true;
}

// Extrae email/nombre/teléfono/empresa de los campos (los nombres vienen del formulario).
function pickPerson(data) {
  const entries = Object.entries(data || {});
  const find = (re) => (entries.find(([k, v]) => re.test(k) && String(v).trim()) || [])[1] || "";
  return {
    email: norm(find(/e-?mail directo|correo electr[oó]nico de facturaci|e-?mail|correo/i)),
    firstName: find(/^nombre/i),
    lastName: find(/^apellidos/i),
    phone: find(/tel[eé]fono directo|tel[eé]fono/i),
    company: find(/denominaci[oó]n|empresa/i),
  };
}

async function processFormSubmissions() {
  const snap = await db.collection("formSubmissions").where("status", "==", "recibido").limit(50).get();
  let linked = 0;
  for (const doc of snap.docs) {
    const s = doc.data();
    const orgId = s.orgId || DEFAULT_ORG_ID;
    const label = FORM_LABEL[s.formType] || s.formName || s.formType;
    let contactId = "", leadId = "", dealId = s.dealId || "";
    if (dealId) {
      const d = await db.collection("deals").doc(dealId).get();
      if (d.exists && d.data().orgId === orgId) contactId = d.data().contactId || "";
      else dealId = "";
    }
    // Formularios creados con campos "guardar en la ficha como": solo esos. Si no, por el nombre del campo.
    const person = s.mapped ? { email: "", firstName: "", lastName: "", phone: "", company: "" } : pickPerson(s.data);
    for (const [k, v] of Object.entries(s.person || {})) if (MAPS.has(k) && v) person[k] = k === "email" ? norm(v) : String(v);
    if (!contactId) {
      const r = await resolvePerson(orgId, { ...person, source: "Formulario web", notes: `Creado por el formulario "${label}"` });
      contactId = r.contactId; leadId = r.leadId;
    }
    await addActivity(orgId, {
      type: "Formulario",
      title: `📋 Formulario recibido: ${label}${person.company ? ` — ${person.company}` : ""}`,
      entity: dealId ? "deal" : leadId ? "lead" : contactId ? "contact" : null,
      entityId: dealId || leadId || contactId || null,
      contactId, leadId, formSubmissionId: doc.id, formType: s.formType,
    });
    const subscribed = s.listId ? await subscribeToList(s.listId, person.email, [person.firstName, person.lastName].filter(Boolean).join(" "), s.formType).catch((e) => { console.warn("[forms] lista:", e.message); return false; }) : false;
    await doc.ref.update({ contactId, leadId, dealId, status: "vinculado", linkedAt: new Date(), ...(subscribed ? { subscribedToList: true } : {}) });
    linked++;
  }
  return { linked };
}

module.exports = { submitForm, formDefinition, publicForms, processFormSubmissions, verifyRecaptcha, pickPerson, loadCustomForm };
