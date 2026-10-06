// Embudos (pipelines) persistidos en Firestore, con tablero positivo y negativo
// por embudo — portado del prototipo (islas-sem-demo).
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useOrg } from "./useOrg";
import { crmUpdate } from "./crm";

/* Etapas por defecto del tablero POSITIVO (idénticas al prototipo). */
export const DEFAULT_POS_STAGES = [
  { id: "s1", name: "Prospectos" },
  { id: "s2", name: "Cualificación leads" },
  { id: "s3", name: "Enviar Presupuesto" },
  { id: "s4", name: "SEPA" },
  { id: "s5", name: "Contrato" },
  { id: "s6", name: "Equipo" },
  { id: "s7", name: "Satisfacción" },
];

/* Etapas por defecto del tablero NEGATIVO (con grupos de plazos, como el prototipo). */
export const DEFAULT_NEG_STAGES = [
  { id: "n1", name: "Baja Calidad" },
  {
    id: "gp",
    name: "Presupuesto",
    group: true,
    sub: [
      { id: "np1", name: "72 horas" },
      { id: "np2", name: "7 días" },
      { id: "np3", name: "28 días" },
    ],
  },
  {
    id: "gc",
    name: "Contrato",
    group: true,
    sub: [
      { id: "nc1", name: "72 horas" },
      { id: "nc2", name: "7 días" },
      { id: "nc3", name: "28 días" },
    ],
  },
  { id: "n4", name: "Perdido" },
];

export const STAGE_COLORS = ["#3aa5c9", "#5b8def", "#2a9d8f", "#17b1c4", "#1faa59", "#e08a2b", "#9b59b6", "#d94f70"];
export const NEG_COLORS = ["#e07a5f", "#d9534f", "#c9445a", "#b5386b", "#a83279", "#8e2f74"];

/* Prioridad por volumen de presupuesto (color del borde de la tarjeta). */
export const BUDGET_TIERS = [
  { max: 3000, color: "#2ecc71", label: "0 – 3.000 €" },
  { max: 6000, color: "#2f80ed", label: "3.001 – 6.000 €" },
  { max: 12000, color: "#8b5cf6", label: "6.001 – 12.000 €" },
  { max: 25000, color: "#f2994a", label: "12.001 – 25.000 €" },
  { max: 40000, color: "#eb5757", label: "25.001 – 40.000 €" },
  { max: Infinity, color: "#111827", label: "+40.000 €" },
];
export function budgetTier(amount) {
  const n = Number(amount) || 0;
  return BUDGET_TIERS.find((t) => n <= t.max) || BUDGET_TIERS[BUDGET_TIERS.length - 1];
}

export const CLIENT_TIERS = {
  nuevo: { label: "Cliente nuevo", icon: "🆕", color: "#2a9d8f" },
  recurrente: { label: "Cliente recurrente", icon: "🔁", color: "#2f80ed" },
  vip: { label: "Cliente VIP", icon: "⭐", color: "#e2b83c" },
};

/* Aplana etapas (los grupos se expanden a sus sub-etapas). */
export function flattenStages(stages) {
  const out = [];
  (stages || []).forEach((s) => {
    if (s.group && s.sub) s.sub.forEach((ss) => out.push(ss));
    else out.push(s);
  });
  return out;
}
export function findStage(stages, sid) {
  for (const s of stages || []) {
    if (s.id === sid) return s;
    if (s.group && s.sub) {
      const f = s.sub.find((x) => x.id === sid);
      if (f) return f;
    }
  }
  return null;
}

const boardKey = (board) => (board === "neg" ? "negStages" : "stages");

/* Hook: embudos de la organización (crea uno por defecto si no hay). */
export function usePipelines() {
  const { orgId, ready } = useOrg();
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!ready) return;
    if (!orgId) {
      setPipelines([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "pipelines"), where("orgId", "==", orgId));
    const unsub = onSnapshot(
      q,
      async (snap) => {
        if (snap.empty) {
          // Sembrar embudo por defecto (idéntico al prototipo).
          try {
            await addDoc(collection(db, "pipelines"), {
              orgId,
              name: "ISLAS SEM",
              order: 0,
              stages: DEFAULT_POS_STAGES,
              negStages: DEFAULT_NEG_STAGES,
              createdAt: serverTimestamp(),
            });
          } catch (e) {
            console.warn("[pipelines] no se pudo sembrar el embudo por defecto:", e);
          }
          return; // el snapshot se re-disparará con el nuevo doc
        }
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setPipelines(rows);
        setLoading(false);
      },
      (err) => {
        if (err.code === "permission-denied" && retry < 4) {
          setTimeout(() => setRetry((r) => r + 1), 1500);
        } else {
          console.error("[pipelines] error:", err);
          setLoading(false);
        }
      }
    );
    return unsub;
  }, [orgId, ready, retry]);

  return { pipelines, loading, orgId };
}

/* CRUD de etapas sobre el array del embudo (board = 'pos' | 'neg'). */
export async function setStages(pipeline, board, stages) {
  return crmUpdate("pipelines", pipeline.id, { [boardKey(board)]: stages });
}
export function getStages(pipeline, board) {
  return (board === "neg" ? pipeline.negStages : pipeline.stages) || [];
}

export async function addStage(pipeline, board, name) {
  const stages = [...getStages(pipeline, board), { id: "st" + Date.now(), name }];
  return setStages(pipeline, board, stages);
}
export async function renameStage(pipeline, board, sid, name) {
  const stages = getStages(pipeline, board).map((s) => {
    if (s.id === sid) return { ...s, name };
    if (s.group && s.sub) return { ...s, sub: s.sub.map((ss) => (ss.id === sid ? { ...ss, name } : ss)) };
    return s;
  });
  return setStages(pipeline, board, stages);
}
export async function deleteStage(pipeline, board, sid) {
  const stages = getStages(pipeline, board)
    .map((s) => (s.group && s.sub ? { ...s, sub: s.sub.filter((ss) => ss.id !== sid) } : s))
    .filter((s) => s.id !== sid);
  return setStages(pipeline, board, stages);
}
export async function moveStage(pipeline, board, sid, dir) {
  const stages = getStages(pipeline, board);
  // nivel superior
  let i = stages.findIndex((s) => s.id === sid);
  if (i >= 0) {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const copy = [...stages];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return setStages(pipeline, board, copy);
  }
  // dentro de un grupo
  for (let g = 0; g < stages.length; g++) {
    const grp = stages[g];
    if (grp.group && grp.sub) {
      const k = grp.sub.findIndex((s) => s.id === sid);
      if (k >= 0) {
        const j = k + dir;
        if (j < 0 || j >= grp.sub.length) return;
        const sub = [...grp.sub];
        [sub[k], sub[j]] = [sub[j], sub[k]];
        const copy = [...stages];
        copy[g] = { ...grp, sub };
        return setStages(pipeline, board, copy);
      }
    }
  }
}

export async function createPipeline(orgId, name, order) {
  return addDoc(collection(db, "pipelines"), {
    orgId,
    name,
    order: order || 0,
    stages: DEFAULT_POS_STAGES,
    negStages: DEFAULT_NEG_STAGES,
    createdAt: serverTimestamp(),
  });
}
