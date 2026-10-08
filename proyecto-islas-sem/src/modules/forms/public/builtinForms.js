// Formularios públicos fijos, replicados del Bitrix real de ISLAS SEM (SEPA y Datos Jurídicos).
// Los usan la página pública (/f/:formType) y CRM › Formularios (para duplicarlos como base).
// Los formularios creados por el usuario viven en Firestore (crmForms) y tienen la misma forma:
// { title, desc, consentTitle, consentCheck, fields: [{ k, req, type?, options?, maps? }] }.
export const BUILTIN_FORMS = {
  sepa: {
    title: "ORDEN DE DOMICILIACIÓN DE ADEUDO SEPA",
    desc: "Aceptación del adeudo sepa",
    consentTitle: "Aceptación Domiciliación Bancaria",
    consentCheck: "Al hacer clic en un botón de envío, acepto el consentimiento",
    fields: [
      { k: "Nombre Completo del titular de la cuenta o titulares", req: false },
      { k: "Apellidos Representante Legal del titular de la cuenta", req: false },
      { k: "Denominación de la Sociedad y/o autónomo", req: true },
      { k: "IBAN", req: true },
      { k: "SWIFT BIC", req: false },
      { k: "Dirección de la Sucursal Bancaria", req: false },
      { k: "Teléfono de la Sucursal Bancaria", req: false, type: "tel" },
      { k: "Signatario de autorizaciones de la cuenta (la persona que firma)", req: false },
      { k: "Aceptado por (Nombre y Apellidos de la persona que está firmando)", req: false },
    ],
  },
  juridicos: {
    title: "SOLICITUD DATOS JURÍDICOS DEL REPRESENTANTE / CONTRATOS LEGALES",
    desc: "Tratamiento de datos en cumplimiento de la protección de datos",
    consentTitle: "Aceptación del Tratamiento y la Protección de Datos",
    consentCheck: "Al hacer clic en un botón de envío, acepta el consentimiento",
    fields: [
      { k: "Nombre Representante Legal", req: true },
      { k: "Apellidos Representante Legal", req: true },
      { k: "DNI Representante Legal", req: true },
      { k: "Teléfono directo del Representante Legal", req: true, type: "tel" },
      { k: "E-mail directo del Representante Legal", req: true, type: "email" },
      { k: "Denominación de la Sociedad y/o Autónoma", req: true },
      { k: "CIF/NIF", req: true },
      { k: "Dirección Fiscal completa", req: true },
      { k: "Provincia", req: true },
      { k: "Teléfono de facturación", req: true, type: "tel" },
      { k: "Correo electrónico de facturación", req: true, type: "email" },
      { k: "Correo electrónico Protección de datos", req: true, type: "email" },
      { k: "N° empleados-as Jornada Completa", req: true },
      { k: "Actividad Empresarial", req: true },
      { k: "¿Qué producto está interesado/a?", req: false, type: "select", options: ["PÁGINA WEB", "TIENDA ONLINE", "CRM - CENTRO RELACIÓN DE CLIENTES", "REDES SOCIALES", "SEO Y POSICIONAMIENTO WEB", "FACTURACIÓN", "INTELIGENCIA ECONÓMICA NEGOCIOS", "OFICINA VIRTUAL"] },
      { k: "Programación Personalizada", req: false, type: "select", options: ["Programación por horas", "Aplicación Web", "Aplicación Móvil", "Solución Incidencia Técnica"] },
      { k: "Consultoría y Asesoramiento", req: false, type: "select", options: ["Ventas Digitales", "Inteligencia Artificial"] },
    ],
  },
};

export const BUILTIN_LIST = [
  { type: "juridicos", name: "Solicitud Datos Jurídicos – Representante Legal", short: "Datos Jurídicos", list: "Leads formulario web" },
  { type: "sepa", name: "Orden de Domiciliación SEPA", short: "Orden SEPA", list: "Clientes activos" },
];

// Nombre corto de un envío para las fichas (fijos o creados).
export function submissionLabel(s) {
  return BUILTIN_LIST.find((b) => b.type === s.formType)?.short || s.formName || "Formulario";
}

// Campos de un envío en el orden del formulario (los mapas de Firestore no guardan orden).
export function submissionEntries(s) {
  const data = s.data || {};
  const order = Array.isArray(s.fieldOrder) ? s.fieldOrder : BUILTIN_FORMS[s.formType]?.fields.map((f) => f.k) || [];
  const keys = [...order.filter((k) => k in data), ...Object.keys(data).filter((k) => !order.includes(k))];
  return keys.map((k) => [k, data[k]]);
}
