// Asignar a embudos propios las negociaciones importadas de Bitrix que aún no tienen
// embudo. Se agrupan por "embudo › etapa" de Bitrix y ISLAS SEM decide el destino.
import { useMemo, useState } from "react";
import CrmModal from "./CrmModal";
import { crmUpdate } from "../lib/crm";
import { getStages, flattenStages } from "../lib/pipelines";

export default function AssignImportedDeals({ deals, pipelines, onClose }) {
  const groups = useMemo(() => {
    const g = {};
    deals.forEach((d) => {
      const k = `${d.bitrixFunnel || "Sin embudo"} › ${d.bitrixStage || "—"}`;
      (g[k] = g[k] || []).push(d);
    });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [deals]);
  const [target, setTarget] = useState({}); // grupo -> { pipelineId, board, stage }
  const [busy, setBusy] = useState("");

  const stagesOf = (pipelineId, board) => {
    const p = pipelines.find((x) => x.id === pipelineId);
    return p ? flattenStages(getStages(p, board || "pos")) : [];
  };

  const setT = (k, patch) =>
    setTarget((t) => {
      const next = { board: "pos", ...t[k], ...patch };
      if (patch.pipelineId !== undefined || patch.board !== undefined) next.stage = stagesOf(next.pipelineId, next.board)[0]?.id || "";
      return { ...t, [k]: next };
    });

  const apply = async (k, rows) => {
    const t = target[k];
    if (!t?.pipelineId || !t.stage) return;
    setBusy(k);
    try {
      await Promise.all(rows.map((d) => crmUpdate("deals", d.id, { pipelineId: t.pipelineId, board: t.board || "pos", stage: t.stage })));
    } finally {
      setBusy("");
    }
  };

  return (
    <CrmModal title="Negociaciones importadas sin embudo" onClose={onClose} maxWidth={900}
      footer={<button className="crm-btn" onClick={onClose}>Cerrar</button>}>
      <p style={{ marginTop: 0, color: "var(--crm-muted)", fontSize: 14 }}>
        Vienen de Bitrix agrupadas por su embudo y etapa de origen. Elige a qué embudo y etapa de tu CRM va cada grupo.
      </p>
      {groups.length ? (
        <table className="crm-table">
          <thead><tr><th>Bitrix (embudo › etapa)</th><th>Nº</th><th>Embudo</th><th>Tablero</th><th>Etapa</th><th></th></tr></thead>
          <tbody>
            {groups.map(([k, rows]) => {
              const t = target[k] || {};
              const stages = stagesOf(t.pipelineId, t.board);
              return (
                <tr key={k}>
                  <td style={{ fontWeight: 600 }}>{k}</td>
                  <td>{rows.length}</td>
                  <td>
                    <select value={t.pipelineId || ""} onChange={(e) => setT(k, { pipelineId: e.target.value })}>
                      <option value="">— elegir —</option>
                      {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={t.board || "pos"} onChange={(e) => setT(k, { board: e.target.value })}>
                      <option value="pos">Positivo</option>
                      <option value="neg">Negativo</option>
                    </select>
                  </td>
                  <td>
                    <select value={t.stage || ""} disabled={!stages.length} onChange={(e) => setT(k, { stage: e.target.value })}>
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="crm-btn sm" disabled={!t.pipelineId || !t.stage || busy === k} onClick={() => apply(k, rows)}>
                      {busy === k ? "Moviendo…" : "Asignar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>Todas las negociaciones importadas ya tienen embudo. ✅</p>
      )}
    </CrmModal>
  );
}
