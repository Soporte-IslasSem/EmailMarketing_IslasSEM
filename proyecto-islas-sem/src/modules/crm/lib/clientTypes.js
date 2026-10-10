// Tipo de cliente = el servicio del que es cliente (el campo "Tipo Cliente" de Bitrix:
// RGPD, Subvención Kit Digital, Asesoría…). La empresa define la lista en
// CRM › Contactos › "Tipos de cliente" (organizations/{orgId}.clientTypes) y solo los
// administradores la editan o cambian el tipo de un contacto. Cada contacto guarda el id
// en `clientType`.
// Aparte, `relation` es la relación con la empresa (nuevo / recurrente / VIP).
import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useOrg } from "./useOrg";

export const DEFAULT_CLIENT_TYPES = [
  { id: "asesoria", label: "ASESORIA", icon: "", color: "#2f80ed" },
  { id: "rgpd", label: "RGPD", icon: "", color: "#1a9190" },
  { id: "subvencion-kit-digital", label: "SUBVENCIÓN KIT DIGITAL", icon: "", color: "#e08a2b" },
  { id: "bitrix24", label: "BITRIX24", icon: "", color: "#8b5cf6" },
];

export const RELATIONS = [
  { id: "nuevo", label: "Nuevo", icon: "🆕" },
  { id: "recurrente", label: "Recurrente", icon: "🔁" },
  { id: "vip", label: "VIP", icon: "⭐" },
];

export function useClientTypes() {
  const { orgId } = useOrg();
  const [types, setTypes] = useState(DEFAULT_CLIENT_TYPES);
  useEffect(() => {
    if (!orgId) return undefined;
    return onSnapshot(
      doc(db, "organizations", orgId),
      (s) => { const t = s.data()?.clientTypes; setTypes(Array.isArray(t) && t.length ? t : DEFAULT_CLIENT_TYPES); },
      () => setTypes(DEFAULT_CLIENT_TYPES)
    );
  }, [orgId]);
  return { types, orgId };
}

export const saveClientTypes = (orgId, list) => updateDoc(doc(db, "organizations", orgId), { clientTypes: list });

// Tipo de un contacto (si se borró el tipo, se muestra su id tal cual).
export function typeOf(types, id) {
  if (!id) return null;
  return types.find((t) => t.id === id) || { id, label: id, icon: "", color: "#8a9a9a" };
}

export function newTypeId(label, types) {
  const base = String(label).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "tipo";
  let id = base, n = 2;
  while (types.some((t) => t.id === id)) id = `${base}-${n++}`;
  return id;
}
