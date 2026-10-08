// Utilidades del creador de formularios (CRM › Formularios): tipos de campo, mapeo a la
// ficha del cliente y copia editable de un formulario (fijo o creado).
export const FIELD_TYPES = [
  ["text", "Texto corto"],
  ["email", "Email"],
  ["tel", "Teléfono"],
  ["number", "Número"],
  ["date", "Fecha"],
  ["textarea", "Texto largo"],
  ["select", "Desplegable"],
];

export const FIELD_MAPS = [
  ["", "— No guardar en la ficha —"],
  ["email", "Email del cliente"],
  ["firstName", "Nombre"],
  ["lastName", "Apellidos"],
  ["phone", "Teléfono"],
  ["company", "Empresa"],
];

export const EMPTY_FORM = {
  name: "",
  title: "",
  description: "",
  consentTitle: "Aceptación del Tratamiento y la Protección de Datos",
  consentCheck: "Al hacer clic en un botón de envío, acepto el consentimiento",
  successMessage: "Hemos registrado tu formulario. Nuestro equipo continuará con el proceso.",
  active: true,
  fields: [
    { k: "Nombre", type: "text", req: true, maps: "firstName" },
    { k: "Apellidos", type: "text", req: false, maps: "lastName" },
    { k: "Email", type: "email", req: true, maps: "email" },
    { k: "Teléfono", type: "tel", req: false, maps: "phone" },
  ],
};

// Mapeo sugerido a partir del tipo/nombre del campo (para duplicar SEPA / Jurídicos).
function guessMap(f) {
  const k = f.k.toLowerCase();
  if (f.type === "email" && /directo|^e-?mail$|^correo$/.test(k)) return "email";
  if (/^nombre/.test(k)) return "firstName";
  if (/^apellidos/.test(k)) return "lastName";
  if (f.type === "tel" && /directo|^tel[eé]fono$/.test(k)) return "phone";
  if (/denominaci[oó]n|^empresa/.test(k)) return "company";
  return "";
}

// Copia editable de un formulario fijo o creado.
export function formDraftFrom(src, name) {
  return {
    ...EMPTY_FORM,
    name,
    title: src.title || "",
    description: src.desc ?? src.description ?? "",
    consentTitle: src.consentTitle || EMPTY_FORM.consentTitle,
    consentCheck: src.consentCheck || EMPTY_FORM.consentCheck,
    successMessage: src.successMessage || EMPTY_FORM.successMessage,
    fields: (src.fields || []).map((f) => ({
      k: f.k, type: f.type || "text", req: !!f.req,
      ...(f.type === "select" ? { options: [...(f.options || [])] } : {}),
      maps: f.maps ?? guessMap(f),
    })),
  };
}
