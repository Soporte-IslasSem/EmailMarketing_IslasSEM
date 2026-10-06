// Campos personalizados del CRM (como los UF_* de Bitrix): cada organización define
// sus propios campos por entidad en Ajustes de CRM. Las definiciones viven en la
// colección `customFields`; los valores, dentro de cada documento en `custom.{key}`.
import { useMemo } from "react";
import { useCrmCollection } from "./crm";

export const CF_ENTITIES = [
  { id: "contacts", label: "Contactos" },
  { id: "companies", label: "Compañías" },
  { id: "leads", label: "Prospectos" },
  { id: "deals", label: "Negociaciones" },
];

export const CF_TYPES = [
  { id: "text", label: "Texto" },
  { id: "textarea", label: "Texto largo" },
  { id: "number", label: "Número" },
  { id: "date", label: "Fecha" },
  { id: "select", label: "Lista de opciones" },
  { id: "checkbox", label: "Sí / No" },
  { id: "email", label: "Email" },
  { id: "url", label: "Enlace" },
];

// "Nº de trabajadores" -> "n_de_trabajadores"
export function slugKey(label) {
  return String(label || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
    .slice(0, 40) || "campo";
}

export function useCustomFields(entity) {
  const { items, loading } = useCrmCollection("customFields");
  const fields = useMemo(
    () => items.filter((f) => f.entity === entity && !f.archived).sort((a, b) => (a.sort || 0) - (b.sort || 0)),
    [items, entity]
  );
  return { fields, loading };
}

export function formatCustom(field, value) {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "checkbox") return value ? "Sí" : "No";
  if (field.type === "date") {
    const d = new Date(value);
    return isNaN(d) ? String(value) : d.toLocaleDateString("es-ES");
  }
  return String(value);
}
