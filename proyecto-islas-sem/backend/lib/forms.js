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
//    Si el envío no viene de una negociación, cae en el Kanban: se reutiliza la negociación
//    abierta de esa persona en el embudo o se crea una nueva en la primera etapa
//    (el formulario puede elegir el embudo o "no crear negociación").
//    Cubre también envíos antiguos escritos directamente desde el navegador.
//    Si el formulario tiene "tipo de cliente" (o su lista destino es la de un tipo), quien lo
//    rellena queda como contacto con ese tipo: si era prospecto se convierte en contacto.
//    Se lee la versión del formulario al procesar el envío: lo que se cambie en el CRM vale ya.
const { db } = require("./firebase");
const { DEFAULT_ORG_ID, norm, resolvePerson, addActivity } = require("./link");
const { addSubscriber } = require("./subscriptions");
const { orgOfUser, getOrg, isActive, brandOf } = require("./tenant");
const { getStages, flattenStages } = require("./stages");
const { respond } = require("./stageflow");

const FORM_LABEL = { sepa: "Orden de Domiciliación SEPA", juridicos: "Datos Jurídicos del Representante" };
const MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5);
const FIELD_TYPES = new Set(["text", "email", "tel", "number", "date", "textarea", "select", "check"]);
const MAPS = new Set(["email", "firstName", "lastName", "phone", "company"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const HEX = /^#[0-9a-f]{6}$/i;
const TYPE_ID = /^[a-z0-9-]{1,64}$/;

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
    dealPipelineId: String(f.dealPipelineId || "").slice(0, 64),
    clientType: TYPE_ID.test(f.clientType || "") ? f.clientType : "",
    fields,
  };
}

// GET /api/forms/def/:id — lo que necesita la página pública para pintar el formulario.
async function formDefinition(req, res) {
  try {
    const f = await loadCustomForm(String(req.params.id || ""));
    if (!f || !f.active) return res.status(404).json({ ok: false, error: "Formulario no encontrado" });
    const { orgId, id: _i, listId: _l, active: _a, dealPipelineId: _d, clientType: _t, ...pub } = f;
    const b = brandOf(await getOrg(orgId));
    res.set("Cache-Control", "no-store").json({ ok: true, form: pub, org: { id: orgId, name: b.name, legalName: b.legalName, logoUrl: b.logoUrl } });
  } catch (e) {
    console.error("[forms/def]", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
}

// GET /api/forms/public — formularios publicados para la página de clientela.
async function publicForms(req, res) {
  try {
    // ?org=<id>: página de clientela de otra empresa; sin él, la de ISLAS SEM.
    const orgId = /^[A-Za-z0-9_-]{1,64}$/.test(String(req.query?.org || "")) ? String(req.query.org) : DEFAULT_ORG_ID;
    const org = await getOrg(orgId);
    if (!org || !isActive(org)) return res.status(404).json({ ok: false, error: "No encontrado" });
    const snap = await db.collection("crmForms").where("orgId", "==", orgId).get();
    const saved = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    const out = [];
    const fixed = orgId === DEFAULT_ORG_ID ? [["juridicos", "Solicitud Datos Jurídicos – Representante Legal"], ["sepa", "Orden de Domiciliación SEPA"]] : [];
    for (const [id, label] of fixed) {
      const o = saved[id];
      if (!o || o.active !== false) out.push({ id, name: o?.name || label });
    }
    snap.docs
      .filter((d) => !FORM_LABEL[d.id] && d.data().active !== false)
      .sort((a, b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0))
      .forEach((d) => out.push({ id: d.id, name: String(d.data().name || d.data().title || "Formulario").slice(0, 120) }));
    const b = brandOf(org);
    res.set("Cache-Control", "no-store").json({ ok: true, forms: out, org: { id: orgId, name: b.name, logoUrl: b.logoUrl } });
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
    // Embudo destino (vale también para SEPA/Jurídicos editados).
    if (custom?.dealPipelineId) extra.dealPipelineId = custom.dealPipelineId;
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

// "Lista destino": suscribe el email del formulario a esa lista de Email Marketing, con la
// misma lógica que el resto de altas (doble confirmación de la lista, aviso y webhook).
async function subscribeToList(listId, email, name, formId, orgId) {
  if (!listId || !EMAIL_RE.test(email || "")) return false;
  // La lista tiene que ser de la misma empresa que el formulario.
  const list = (await db.collection("lists").doc(String(listId)).get().catch(() => null))?.data();
  if (!list || (await orgOfUser(list.userId)) !== orgId) return false;
  const r = await addSubscriber({ listId, email, name, source: "crm-form", formId });
  return r.status === "subscribed" || r.status === "pending" ? r.status : false;
}

// Datos Jurídicos lleva la aceptación del tratamiento de datos: la empresa del cliente
// queda con RGPD "Firmado" (se busca por CIF, por la empresa del contacto o por el nombre;
// si no existe, se crea con los datos del formulario). Devuelve el id de la empresa.
const normCif = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function markRgpdSigned(orgId, data, contactId, submissionId) {
  const entries = Object.entries(data || {});
  const get = (re) => String((entries.find(([k, v]) => re.test(k) && String(v).trim()) || [])[1] || "").trim();
  const cif = get(/cif|nif/i);
  const name = get(/denominaci[oó]n/i);
  const companies = (await db.collection("companies").where("orgId", "==", orgId).get()).docs;
  let ref = null;
  if (cif) ref = companies.find((d) => normCif(d.data().cif) && normCif(d.data().cif) === normCif(cif))?.ref || null;
  let contact = null;
  if (contactId) {
    const c = await db.collection("contacts").doc(contactId).get();
    contact = c.exists ? c.data() : null;
    if (!ref && contact?.companyId) ref = companies.find((d) => d.id === contact.companyId)?.ref || null;
  }
  if (!ref && name) ref = companies.find((d) => String(d.data().name || "").trim().toLowerCase() === name.toLowerCase())?.ref || null;
  const signed = { rgpd: "Firmado", rgpdAt: new Date(), rgpdSource: "Formulario Datos Jurídicos", rgpdSubmissionId: submissionId, updatedAt: new Date() };
  if (ref) {
    const cur = companies.find((d) => d.id === ref.id).data();
    await ref.update({ ...signed, ...(cif && !cur.cif ? { cif } : {}) });
  } else {
    if (!name && !cif) return "";
    ref = await db.collection("companies").add({
      orgId, name: name || cif, cif, address: get(/direcci[oó]n fiscal/i), province: get(/provincia/i),
      email: get(/correo electr[oó]nico de facturaci/i), phone: get(/tel[eé]fono de facturaci/i),
      employees: get(/empleados/i), industry: get(/actividad/i), source: "Formulario web", notes: "", custom: {},
      createdAt: new Date(), ...signed,
    });
  }
  if (contactId && contact && !contact.companyId) {
    await db.collection("contacts").doc(contactId).update({ companyId: ref.id, ...(contact.company ? {} : { company: name }) });
  }
  return ref.id;
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

// Embudo donde caen los envíos: el elegido en el formulario o el primero de la organización.
async function pickPipeline(orgId, wanted) {
  const snap = await db.collection("pipelines").where("orgId", "==", orgId).get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return all.find((p) => p.id === wanted) || all[0] || null;
}

// Producto de interés del formulario ("¿Qué producto…?", "Servicio de interés") que exista en el catálogo.
const normName = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
async function pickProducts(orgId, data) {
  const wanted = Object.entries(data || {})
    .filter(([k, v]) => /producto|servicio/i.test(k) && String(v).trim())
    .flatMap(([, v]) => String(v).split(/[,;]/).map(normName)).filter(Boolean);
  if (!wanted.length) return [];
  const snap = await db.collection("products").where("orgId", "==", orgId).get();
  const out = [];
  for (const w of wanted) {
    const p = snap.docs.find((d) => normName(d.data().name) === w);
    if (p && !out.some((it) => it.prodId === p.id)) out.push({ prodId: p.id, name: p.data().name, price: Number(p.data().price) || 0, qty: 1 });
  }
  return out;
}

// Cuelga el envío de una negociación: la abierta de esa persona en el embudo o una nueva
// en la primera etapa del Kanban positivo. Devuelve { dealId, created }.
async function ensureDeal(orgId, s, { contactId, leadId, person, label }) {
  if (s.dealPipelineId === "none") return { dealId: "", created: false };
  const pipeline = await pickPipeline(orgId, s.dealPipelineId);
  if (!pipeline) return { dealId: "", created: false };
  const owner = contactId ? ["contactId", contactId] : leadId ? ["leadId", leadId] : null;
  if (owner) {
    const open = (await db.collection("deals").where("orgId", "==", orgId).where(owner[0], "==", owner[1]).get()).docs
      .find((d) => d.data().pipelineId === pipeline.id && d.data().status !== "ganado" && d.data().status !== "perdido");
    if (open) return { dealId: open.id, created: false };
  }
  let name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  let company = person.company || "";
  if (contactId) {
    const c = await db.collection("contacts").doc(contactId).get();
    if (c.exists) {
      name = name || [c.data().firstName, c.data().lastName].filter(Boolean).join(" ");
      company = company || c.data().company || "";
    }
  }
  const stage = flattenStages(getStages(pipeline, "pos"))[0];
  const items = await pickProducts(orgId, s.data).catch(() => []);
  // Lo que pidió y no está en el catálogo queda escrito en el comentario.
  const interest = Object.entries(s.data || {}).filter(([k, v]) => /producto|servicio/i.test(k) && String(v).trim())
    .map(([k, v]) => `${k}: ${v}`).join("\n");
  const subtotal = items.reduce((a, it) => a + it.price * it.qty, 0);
  const ref = await db.collection("deals").add({
    orgId, pipelineId: pipeline.id, board: "pos", stage: stage?.id || "s1",
    title: `${label} — ${company || name || person.email || "Sin nombre"}`.slice(0, 200),
    amount: subtotal * 1.21, contact: name, contactId: contactId || null, leadId: leadId || "",
    contactEmail: person.email || "", company, clientType: "nuevo", priceType: "producto",
    type: "Sales", source: "Formulario web", responsable: "", notes: items.length ? "" : interest,
    ...(items.length ? { items, subtotal, itemsCount: items.length } : {}),
    formSubmissionId: s.id, sourceFormId: String(s.formType || ""), sourceFormName: label,
    custom: {}, createdAt: new Date(), updatedAt: new Date(),
  });
  return { dealId: ref.id, created: true };
}

// Tipo de cliente que da el formulario: el elegido en él o, si no, el de su lista destino
// (cada tipo de cliente es una lista de Email Marketing).
async function formClientType(formType) {
  const f = await loadCustomForm(String(formType || "")).catch(() => null);
  if (!f) return "";
  if (f.clientType) return f.clientType;
  if (!f.listId) return "";
  const l = await db.collection("lists").doc(f.listId).get().catch(() => null);
  const key = String(l?.data()?.crmKey || "");
  return l?.data()?.crm && key.startsWith("type:") ? key.slice(5) : "";
}

const typesOf = (d) => (Array.isArray(d.clientTypes) ? d.clientTypes.filter(Boolean) : d.clientType ? [d.clientType] : []);

// Le pone el tipo al contacto. Si la persona solo era prospecto, se convierte en contacto con
// ese tipo (como "Convertir" en Prospectos) y sus negociaciones pasan al contacto.
async function applyClientType(orgId, typeId, { contactId, leadId, person, label }) {
  if (!contactId && leadId) {
    const leadRef = db.collection("leads").doc(leadId);
    const lead = (await leadRef.get()).data();
    if (!lead) return { contactId, leadId };
    const prev = lead.convertedContactId ? await db.collection("contacts").doc(lead.convertedContactId).get() : null;
    if (prev?.exists) {
      contactId = prev.id;
    } else {
      const all = await db.collection("contacts").where("orgId", "==", orgId).select("clientId").get();
      let n = 0;
      all.docs.forEach((d) => { const m = /^CLI-(\d+)$/.exec(d.data().clientId || ""); if (m) n = Math.max(n, parseInt(m[1], 10)); });
      const ref = await db.collection("contacts").add({
        orgId, firstName: lead.firstName || person.firstName || "", lastName: lead.lastName || person.lastName || "",
        email: norm(lead.email || person.email), phone: lead.phone || person.phone || "", whatsapp: lead.whatsapp || "",
        company: lead.company || person.company || "", clientTypes: [typeId], clientType: typeId,
        clientId: "CLI-" + String(n + 1).padStart(4, "0"), relation: "nuevo", stage: "Lead", source: lead.source || "Formulario web",
        notes: lead.notes || "", responsable: lead.responsable || "", custom: lead.custom || {}, fromLeadId: leadId,
        createdAt: new Date(), updatedAt: new Date(),
      });
      await leadRef.update({ status: "Convertido", convertedContactId: ref.id, updatedAt: new Date() });
      const deals = await db.collection("deals").where("orgId", "==", orgId).where("leadId", "==", leadId).get();
      for (const d of deals.docs) if (!d.data().contactId) await d.ref.update({ contactId: ref.id, updatedAt: new Date() });
      await addActivity(orgId, { type: "Nota", title: `Prospecto convertido en contacto al rellenar "${label}"`, entity: "contact", entityId: ref.id, contactId: ref.id, leadId });
      return { contactId: ref.id, leadId };
    }
  }
  if (!contactId) return { contactId, leadId };
  const ref = db.collection("contacts").doc(contactId);
  const c = await ref.get();
  const cur = c.exists ? typesOf(c.data()) : [];
  if (c.exists && !cur.includes(typeId)) await ref.update({ clientTypes: [...cur, typeId], clientType: cur[0] || typeId, updatedAt: new Date() });
  return { contactId, leadId };
}

// Datos del formulario que faltan en la ficha (nombre, apellidos, teléfono, empresa): se rellenan
// SOLO los vacíos, nunca se sobrescribe nada, y solo si el email del formulario es el de esa
// ficha (si alguien rellena por otra persona, no se le cambian los datos a nadie).
async function fillEmptyFields(col, id, person) {
  const email = norm(person.email);
  if (!id || !email) return;
  const ref = db.collection(col).doc(id);
  const d = (await ref.get()).data();
  if (!d || norm(d.email) !== email) return;
  const patch = {};
  for (const k of ["firstName", "lastName", "phone", "company"]) {
    const cur = String(d[k] || "").trim();
    // Prospecto creado sin nombre: se le puso la parte del email antes de la @.
    const blank = !cur || (k === "firstName" && cur === email.split("@")[0]);
    if (blank && String(person[k] || "").trim()) patch[k] = String(person[k]).trim().slice(0, 200);
  }
  if (Object.keys(patch).length) await ref.update({ ...patch, updatedAt: new Date() });
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
    const typeId = await formClientType(s.formType);
    if (typeId) {
      ({ contactId, leadId } = await applyClientType(orgId, typeId, { contactId, leadId, person, label })
        .catch((e) => { console.warn("[forms] tipo de cliente:", e.message); return { contactId, leadId }; }));
    }
    await fillEmptyFields(contactId ? "contacts" : "leads", contactId || leadId, person)
      .catch((e) => console.warn("[forms] completar ficha:", e.message));
    let dealCreated = false;
    if (!dealId) {
      const r = await ensureDeal(orgId, { ...s, id: doc.id }, { contactId, leadId, person, label })
        .catch((e) => { console.warn("[forms] negociación:", e.message); return { dealId: "", created: false }; });
      dealId = r.dealId; dealCreated = r.created;
    }
    await addActivity(orgId, {
      type: "Formulario",
      title: `📋 Formulario recibido: ${label}${person.company ? ` — ${person.company}` : ""}`,
      entity: dealId ? "deal" : leadId ? "lead" : contactId ? "contact" : null,
      entityId: dealId || leadId || contactId || null,
      contactId, leadId, formSubmissionId: doc.id, formType: s.formType,
    });
    // Formulario rellenado para una negociación que esperaba respuesta → siguiente etapa.
    if (dealId && !dealCreated) await respond(dealId, `formulario "${label}"`).catch((e) => console.warn("[forms] flujo:", e.message));
    if (dealCreated) {
      await addActivity(orgId, { type: "Nota", title: `Negociación creada desde el formulario "${label}"`, entity: "deal", entityId: dealId, contactId, leadId });
    }
    // Datos Jurídicos (original o editado): RGPD firmado en la empresa.
    if (s.formType === "juridicos") {
      await markRgpdSigned(orgId, s.data, contactId, doc.id).catch((e) => console.warn("[forms] rgpd:", e.message));
    }
    const subscribed = s.listId ? await subscribeToList(s.listId, person.email, [person.firstName, person.lastName].filter(Boolean).join(" "), s.formType, orgId).catch((e) => { console.warn("[forms] lista:", e.message); return false; }) : false;
    await doc.ref.update({ contactId, leadId, dealId, status: "vinculado", linkedAt: new Date(), ...(subscribed ? { subscribedToList: subscribed } : {}) });
    linked++;
  }
  return { linked };
}

module.exports = { ensureDeal, submitForm, formDefinition, publicForms, processFormSubmissions, verifyRecaptcha, pickPerson, loadCustomForm, markRgpdSigned };
