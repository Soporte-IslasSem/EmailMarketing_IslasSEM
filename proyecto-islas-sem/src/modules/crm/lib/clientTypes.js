// Tipos de cliente definidos por la empresa (CRM › Contactos › "Tipos de cliente").
// Se guardan en organizations/{orgId}.clientTypes; si no hay, se usan los de siempre.
// Cada contacto guarda el id en `clientType` (los antiguos: nuevo / recurrente / vip).
import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useOrg } from "./useOrg";

export const DEFAULT_CLIENT_TYPES = [
  { id: "nuevo", label: "Cliente nuevo", icon: "🆕", color: "#2f80ed" },
  { id: "recurrente", label: "Cliente recurrente", icon: "🔁", color: "#1a9190" },
  { id: "vip", label: "Cliente VIP", icon: "⭐", color: "#d4a017" },
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
