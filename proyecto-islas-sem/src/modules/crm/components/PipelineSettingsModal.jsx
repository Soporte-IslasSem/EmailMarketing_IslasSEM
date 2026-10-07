// Ajustes del embudo (botón ⚙ en Negociaciones): renombrar el embudo y gestionar las
// etapas del tablero actual. Al borrar una etapa, sus negociaciones se mueven a otra
// (antes se quedaban sin columna y desaparecían del tablero).
import { useState } from "react";
import CrmModal from "./CrmModal";
import { crmUpdate } from "../lib/crm";
import { getStages, flattenStages, addStage, renameStage, deleteStage, moveStage } from "../lib/pipelines";

export default function PipelineSettingsModal({ pipeline, board, deals, onClose }) {
  const [name, setName] = useState(pipeline.name || "");
  const [newStage, setNewStage] = useState("");
  const [busy, setBusy] = useState(false);
  const stages = flattenStages(getStages(pipeline, board));
  const countIn = (sid) => deals.filter((d) => d.pipelineId === pipeline.id && (d.board || "pos") === board && d.stage === sid).length;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { alert("No se pudo guardar: " + (e.code || e.message)); } finally { setBusy(false); }
  };

  const saveName = () => name.trim() && name.trim() !== pipeline.name && run(() => crmUpdate("pipelines", pipeline.id, { name: name.trim() }));
  const rename = (s) => {
    const n = window.prompt("Nuevo nombre de la etapa:", s.name);
    if (n && n.trim()) run(() => renameStage(pipeline, board, s.id, n.trim()));
  };
  const remove = (s) => {
    if (stages.length <= 1) return alert("El tablero debe tener al menos una etapa.");
    const target = stages.find((x) => x.id !== s.id);
    const n = countIn(s.id);
    const msg = n
      ? `¿Eliminar la etapa "${s.name}"? Sus ${n} negociación(es) pasarán a "${target.name}".`
      : `¿Eliminar la etapa "${s.name}"?`;
    if (!window.confirm(msg)) return;
    run(async () => {
      const moving = deals.filter((d) => d.pipelineId === pipeline.id && (d.board || "pos") === board && d.stage === s.id);
      for (const d of moving) await crmUpdate("deals", d.id, { stage: target.id });
      await deleteStage(pipeline, board, s.id);
    });
  };
  const add = () => newStage.trim() && run(async () => { await addStage(pipeline, board, newStage.trim()); setNewStage(""); });

  return (
    <CrmModal title="Ajustes del embudo" onClose={onClose} maxWidth={560} footer={<button className="crm-btn" onClick={onClose}>Cerrar</button>}>
      <div className="crm-field">
        <label>Nombre del embudo</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
          <button className="crm-btn sm" onClick={saveName} disabled={busy || !name.trim() || name.trim() === pipeline.name}>Guardar</button>
        </div>
      </div>

      <h4 style={{ margin: "16px 0 8px" }}>Etapas del tablero {board === "neg" ? "negativo" : "positivo"}</h4>
      <div style={{ border: "1px solid #e3ecec", borderRadius: 8 }}>
        {stages.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: i < stages.length - 1 ? "1px solid #f0f4f4" : "none" }}>
            <span style={{ flex: 1 }}>
              {s.name} <small style={{ color: "var(--crm-muted)" }}>· {countIn(s.id)} negociación(es)</small>
            </span>
            <button className="crm-btn ghost sm" disabled={busy || i === 0} onClick={() => run(() => moveStage(pipeline, board, s.id, -1))} title="Subir">↑</button>
            <button className="crm-btn ghost sm" disabled={busy || i === stages.length - 1} onClick={() => run(() => moveStage(pipeline, board, s.id, 1))} title="Bajar">↓</button>
            <button className="crm-btn ghost sm" disabled={busy} onClick={() => rename(s)}>Renombrar</button>
            <button className="crm-btn ghost sm" disabled={busy} onClick={() => remove(s)}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          style={{ flex: 1, padding: "8px 10px", border: "1px solid #d8e4e4", borderRadius: 8 }}
          placeholder="Nueva etapa…"
          value={newStage}
          onChange={(e) => setNewStage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="crm-btn sm" onClick={add} disabled={busy || !newStage.trim()}>+ Añadir etapa</button>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--crm-muted)", marginBottom: 0 }}>
        Las etapas agrupadas del tablero negativo (plazos) se muestran por separado. Los cambios se guardan al momento.
      </p>
    </CrmModal>
  );
}
