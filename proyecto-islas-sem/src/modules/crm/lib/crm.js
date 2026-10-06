// Capa de datos del CRM sobre Firestore (multi-tenant por orgId).
// Colecciones raíz: contacts, companies, leads, deals, pipelines, activities.
import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useOrg } from "./useOrg";

/* ============ Constantes de negocio ============ */

// Etapas por defecto del pipeline positivo (editables por el usuario).
export const DEFAULT_PIPELINE_STAGES = [
  { id: "prospecto", name: "Prospecto" },
  { id: "cualificacion", name: "Cualificación" },
  { id: "presupuesto", name: "Enviar Presupuesto" },
  { id: "negociacion", name: "Negociación" },
  { id: "ganado", name: "Ganado" },
  { id: "perdido", name: "Perdido" },
];

export const SOURCE_META = {
  WhatsApp: { icon: "💬", color: "#25d366", bg: "#e7f9ee" },
  Instagram: { icon: "📷", color: "#c13584", bg: "#fbeaf3" },
  Facebook: { icon: "📘", color: "#1877f2", bg: "#e7f0fb" },
  Llamada: { icon: "📞", color: "#2f80ed", bg: "#e7f0fb" },
  "Formulario web": { icon: "🌐", color: "#1a9190", bg: "#e6f4f1" },
  "Google Ads": { icon: "🔎", color: "#ea4335", bg: "#fde8e6" },
  "Redes sociales": { icon: "🌍", color: "#8b5cf6", bg: "#f1ebfd" },
  Email: { icon: "✉️", color: "#6b7d7d", bg: "#eef3f3" },
  Importado: { icon: "📥", color: "#6b7d7d", bg: "#eef3f3" },
  Manual: { icon: "✍️", color: "#6b7d7d", bg: "#eef3f3" },
};
export const LEAD_SOURCES = Object.keys(SOURCE_META);

export const LEAD_STATUSES = ["Nuevo", "Contactado", "Cualificado", "No cualificado", "Convertido"];

export const ACTIVITY_TYPES = ["Tarea", "Llamada", "Email", "Reunión", "Nota", "Seguimiento"];

// Motivos de pérdida (como Bitrix: al cerrar como Perdido se pide el porqué).
export const LOST_REASONS = [
  "Precio demasiado alto",
  "Eligió a la competencia",
  "Sin presupuesto ahora",
  "No responde / sin contacto",
  "No era el cliente adecuado",
  "Proyecto cancelado",
  "Otro motivo",
];

export const CLIENT_TIERS = [
  { id: "nuevo", label: "Cliente nuevo", icon: "🆕" },
  { id: "recurrente", label: "Cliente recurrente", icon: "🔁" },
  { id: "vip", label: "Cliente VIP", icon: "⭐" },
];

export const money = (n) =>
  "€" + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts?.seconds === "number") return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d) ? null : d;
}

export const fmtDate = (ts) => {
  const d = tsToDate(ts);
  return d ? d.toLocaleDateString("es-ES") : "—";
};

/* ============ Hook genérico de colección (tiempo real) ============ */

export function useCrmCollection(name) {
  const { orgId, ready } = useOrg();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!ready) return;
    if (!orgId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, name), where("orgId", "==", orgId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        // En el primer login las reglas recién publicadas pueden tardar en
        // propagarse: reintentamos un par de veces antes de rendirnos.
        if (err.code === "permission-denied" && retry < 4) {
          setTimeout(() => setRetry((r) => r + 1), 1500);
        } else {
          console.error(`[crm] error leyendo ${name}:`, err);
          setLoading(false);
        }
      }
    );
    return unsub;
  }, [orgId, ready, name, retry]);

  return { items, loading, orgId };
}

/* ============ Acciones CRUD ============ */

export async function crmCreate(name, orgId, data) {
  if (!orgId) throw new Error("Sin organización activa");
  return addDoc(collection(db, name), {
    ...data,
    orgId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function crmUpdate(name, id, data) {
  return updateDoc(doc(db, name, id), { ...data, updatedAt: serverTimestamp() });
}

export async function crmRemove(name, id) {
  return deleteDoc(doc(db, name, id));
}

export async function crmGet(name, id) {
  const snap = await getDoc(doc(db, name, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* Registrar una actividad/evento en el timeline (uso interno del CRM). */
export async function logActivity(orgId, { type, title, entity, entityId, contactId, meta }) {
  try {
    await crmCreate("activities", orgId, {
      type: type || "Nota",
      title: title || "",
      entity: entity || null,
      entityId: entityId || null,
      contactId: contactId || "",
      meta: meta || null,
      done: false,
      auto: true,
    });
  } catch (e) {
    console.warn("[crm] no se pudo registrar la actividad:", e);
  }
}
