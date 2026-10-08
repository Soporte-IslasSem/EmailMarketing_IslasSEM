// Constructor de formularios del CRM (réplica del prototipo ISLAS SEM).
//
// Un formulario (crmForms/{id}) tiene la forma:
//   { name, title, desc, btn, color, bg, consentTitle, listId, listName, active,
//     fields: [{ k, type, ph, req, options?, maps? }] }
// - type: text | email | tel | textarea | select | check (casilla de consentimiento RGPD)
// - maps: dónde se copia el valor en la ficha del cliente (email, firstName, lastName,
//   phone, company). Se pone solo al añadir campos de la biblioteca.
// SEPA y Datos Jurídicos se pueden editar: se guarda una versión en crmForms con su
// mismo id ("sepa" / "juridicos"); si no existe, se usa la original.
import { BUILTIN_FORMS, BUILTIN_LIST } from "../../forms/public/builtinForms";

// Biblioteca "Añadir campo" (igual que el prototipo).
export const FIELD_LIB = {
  nombre: { k: "Nombre", type: "text", ph: "Tu nombre", req: true, maps: "firstName" },
  email: { k: "Email", type: "email", ph: "correo@ejemplo.com", req: true, maps: "email" },
  telefono: { k: "Teléfono", type: "tel", ph: "+34 …", req: false, maps: "phone" },
  empresa: { k: "Empresa", type: "text", ph: "Nombre de tu empresa", req: false, maps: "company" },
  servicio: { k: "Servicio de interés", type: "select", ph: "", req: false, options: ["SEO", "SEM / Google Ads", "Redes sociales", "Email marketing"] },
  mensaje: { k: "Mensaje", type: "textarea", ph: "¿En qué podemos ayudarte?", req: false },
  rgpd: { k: "Acepto la política de privacidad", type: "check", ph: "", req: true },
};

export const TYPES = [
  ["text", "Texto"],
  ["email", "Email"],
  ["tel", "Teléfono"],
  ["textarea", "Área de texto"],
  ["select", "Desplegable"],
  ["check", "Casilla"],
];

export const TEMPLATES = [
  ["Contacto", "5 campos · nombre, email, mensaje", ["nombre", "email", "telefono", "mensaje", "rgpd"]],
  ["Newsletter", "2 campos · captación rápida", ["email", "rgpd"]],
  ["Presupuesto", "Lead cualificado con servicio", ["nombre", "email", "empresa", "servicio", "rgpd"]],
  ["Descarga (lead magnet)", "Email + descarga de guía", ["nombre", "email", "rgpd"]],
  ["Evento / webinar", "Registro con asistentes", ["nombre", "email", "empresa", "rgpd"]],
  ["Desde cero", "Lienzo en blanco", ["nombre", "email"]],
];

export const libField = (key) => {
  const f = FIELD_LIB[key];
  return { ...f, ...(f.options ? { options: [...f.options] } : {}) };
};

const BASE = { desc: "Déjanos tus datos y te contactamos.", btn: "Enviar", color: "#1A9190", bg: "#FFFFFF", consentTitle: "", listId: "", listName: "", active: true };

// Nuevo formulario desde una plantilla de la galería.
export function draftFromTemplate(name) {
  const tpl = TEMPLATES.find((t) => t[0] === name) || TEMPLATES[TEMPLATES.length - 1];
  return { ...BASE, title: tpl[0] === "Desde cero" ? "Nuevo formulario" : tpl[0], fields: tpl[2].map(libField) };
}

// Mapeo a la ficha deducido del nombre del campo (para SEPA / Jurídicos).
function guessMap(f) {
  const k = f.k.toLowerCase();
  if (f.type === "email" && /directo|^e-?mail$|^correo$/.test(k)) return "email";
  if (/^nombre/.test(k)) return "firstName";
  if (/^apellidos/.test(k)) return "lastName";
  if (f.type === "tel" && /directo|^tel[eé]fono$/.test(k)) return "phone";
  if (/denominaci[oó]n|^empresa/.test(k)) return "company";
  return "";
}

// Borrador editable de SEPA / Datos Jurídicos (la casilla de consentimiento pasa a ser un campo).
export function draftFromBuiltin(type) {
  const b = BUILTIN_FORMS[type];
  const meta = BUILTIN_LIST.find((x) => x.type === type);
  return {
    ...BASE,
    name: meta?.name || b.title,
    title: b.title,
    desc: b.desc || "",
    btn: "ENVIAR",
    consentTitle: b.consentTitle || "",
    fields: [
      ...b.fields.map((f) => ({ k: f.k, type: f.type || "text", ph: "", req: !!f.req, ...(f.options ? { options: [...f.options] } : {}), maps: guessMap({ k: f.k, type: f.type || "text" }) })),
      { k: b.consentCheck, type: "check", ph: "", req: true },
    ],
  };
}

// Borrador a partir de un formulario guardado (copia profunda de los campos).
export function draftFromDoc(doc) {
  return {
    ...BASE,
    ...doc,
    fields: (doc.fields || []).map((f) => ({ ...f, ...(f.options ? { options: [...f.options] } : {}) })),
  };
}

// Validación y limpieza antes de guardar. Devuelve { error } o { data }.
export function toDoc(d) {
  const fields = (d.fields || []).map((f) => ({
    k: String(f.k || "").trim(),
    type: TYPES.some((t) => t[0] === f.type) ? f.type : "text",
    ph: String(f.ph || "").slice(0, 200),
    req: !!f.req,
    maps: f.maps || "",
    ...(f.type === "select" ? { options: (f.options || []).map((o) => String(o).trim()).filter(Boolean) } : {}),
  }));
  if (!String(d.title || "").trim()) return { error: "Ponle un título al formulario." };
  if (!fields.length) return { error: "Añade al menos un campo." };
  if (fields.some((f) => !f.k)) return { error: "Todos los campos necesitan una etiqueta." };
  const names = fields.map((f) => f.k.toLowerCase());
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return { error: `Hay dos campos con la misma etiqueta: "${fields[names.indexOf(dup)].k}".` };
  const noOpts = fields.find((f) => f.type === "select" && !f.options.length);
  if (noOpts) return { error: `El desplegable "${noOpts.k}" necesita al menos una opción.` };
  // Un mapeo por ficha; y el de email solo en campos de tipo Email.
  const seen = new Set();
  for (const f of fields) {
    if (f.maps === "email" && f.type !== "email") f.maps = "";
    if (f.maps && seen.has(f.maps)) f.maps = "";
    if (f.maps) seen.add(f.maps);
  }
  const hex = (c, def) => (/^#[0-9a-f]{6}$/i.test(String(c || "").trim()) ? String(c).trim() : def);
  return {
    data: {
      name: String(d.name || d.title).trim().slice(0, 120),
      title: String(d.title).trim().slice(0, 200),
      desc: String(d.desc || "").trim().slice(0, 500),
      btn: String(d.btn || "Enviar").trim().slice(0, 60) || "Enviar",
      color: hex(d.color, "#1A9190"),
      bg: hex(d.bg, "#FFFFFF"),
      consentTitle: String(d.consentTitle || "").trim().slice(0, 200),
      listId: d.listId || "",
      listName: d.listName || "",
      active: d.active !== false,
      fields,
    },
  };
}
