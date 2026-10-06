// Formularios públicos: recepción con reCAPTCHA v3 y vinculación a la ficha del cliente.
//
// 1) POST /forms/submit: verifica el token de reCAPTCHA (si RECAPTCHA_SECRET está
//    configurado) y guarda el envío en formSubmissions con el Admin SDK.
// 2) processFormSubmissions() (en el cron): cada envío aún sin vincular se cuelga de
//    su negociación/contacto (o crea un prospecto) y deja una actividad en el timeline.
//    Cubre también envíos antiguos escritos directamente desde el navegador.
const { db } = require("./firebase");
const { DEFAULT_ORG_ID, norm, resolvePerson, addActivity } = require("./link");

const FORM_LABEL = { sepa: "Orden de Domiciliación SEPA", juridicos: "Datos Jurídicos del Representante" };
const MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5);

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

const ALLOWED_TYPES = new Set(Object.keys(FORM_LABEL));

async function submitForm(req, res) {
  try {
    const { formType, dealId, data, recaptchaToken } = req.body || {};
    if (!ALLOWED_TYPES.has(formType) || !data || typeof data !== "object") {
      return res.status(400).json({ ok: false, error: "Formulario no válido" });
    }
    const check = await verifyRecaptcha(recaptchaToken, req.ip);
    if (!check.ok) return res.status(403).json({ ok: false, error: "Verificación anti-spam fallida" });
    // Solo strings, recortadas: no se acepta nada anidado del navegador.
    const clean = {};
    for (const [k, v] of Object.entries(data).slice(0, 60)) clean[String(k).slice(0, 120)] = String(v ?? "").slice(0, 2000);
    await db.collection("formSubmissions").add({
      orgId: DEFAULT_ORG_ID, formType, dealId: String(dealId || "").slice(0, 64), data: clean,
      status: "recibido", recaptchaScore: check.score ?? null, createdAt: new Date(),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("[forms/submit]", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
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
    company: find(/denominaci[oó]n/i),
  };
}

async function processFormSubmissions() {
  const snap = await db.collection("formSubmissions").where("status", "==", "recibido").limit(50).get();
  let linked = 0;
  for (const doc of snap.docs) {
    const s = doc.data();
    const orgId = s.orgId || DEFAULT_ORG_ID;
    const label = FORM_LABEL[s.formType] || s.formType;
    let contactId = "", leadId = "", dealId = s.dealId || "";
    if (dealId) {
      const d = await db.collection("deals").doc(dealId).get();
      if (d.exists && d.data().orgId === orgId) contactId = d.data().contactId || "";
      else dealId = "";
    }
    const person = pickPerson(s.data);
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
    await doc.ref.update({ contactId, leadId, dealId, status: "vinculado", linkedAt: new Date() });
    linked++;
  }
  return { linked };
}

module.exports = { submitForm, processFormSubmissions, verifyRecaptcha, pickPerson };
