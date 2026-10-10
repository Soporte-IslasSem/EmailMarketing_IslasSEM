// Ajustes del embudo (botón ⚙ en Negociaciones, solo administradores):
// - renombrar el embudo y gestionar las etapas de sus dos tableros (positivo y negativo);
//   al borrar una etapa, sus negociaciones se mueven a otra (no desaparecen del tablero);
// - crear un embudo nuevo (con las etapas por defecto o copiando las de este);
// - eliminar el embudo: antes se mueven sus negociaciones a otro embudo.
import { useState } from "react";
import CrmModal from "./CrmModal";
import { crmUpdate, crmRemove } from "../lib/crm";
import { getStages, flattenStages, addStage, renameStage, deleteStage, moveStage, createPipeline } from "../lib/pipelines";

export default function PipelineSettingsModal({ pipeline, pipelines, board: initialBoard, deals, orgId, onClose, onSwitch }) {
  const [board, setBoard] = useState(initialBoard || "pos");
  const [name, setName] = useState(pipeline.name || "");
  const [newStage, setNewStage] = useState("");
  const [newPipe, setNewPipe] = useState("");
  const [copyStages, setCopyStages] = useState(true);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const stages = flattenStages(getStages(pipeline, board));
  const inPipe = deals.filter((d) => d.pipelineId === pipeline.id);
  const countIn = (sid) => inPipe.filter((d) => (d.board || "pos") === board && d.stage === sid).length;
  const others = (pipelines || []).filter((p) => p.id !== pipeline.id);

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
    const to = stages.find((x) => x.id !== s.id);
    const n = countIn(s.id);
    const msg = n ? `¿Eliminar la etapa "${s.name}"? Sus ${n} negociación(es) pasarán a "${to.name}".` : `¿Eliminar la etapa "${s.name}"?`;
    if (!window.confirm(msg)) return;
    run(async () => {
      for (const d of inPipe.filter((x) => (x.board || "pos") === board && x.stage === s.id)) await crmUpdate("deals", d.id, { stage: to.id });
      await deleteStage(pipeline, board, s.id);
    });
  };
  const add = () => newStage.trim() && run(async () => { await addStage(pipeline, board, newStage.trim()); setNewStage(""); });

  const create = () => {
    const n = newPipe.trim();
    if (!n) return;
    if ((pipelines || []).some((p) => p.name.toLowerCase() === n.toLowerCase())) return alert("Ya hay un embudo con ese nombre.");
    run(async () => {
      const ref = await createPipeline(orgId, n, (pipelines || []).length);
      // Copiar las etapas (y sus reglas de automatización) del embudo actual.
      if (copyStages) {
        await crmUpdate("pipelines", ref.id, {
          stages: pipeline.stages || [], negStages: pipeline.negStages || [],
          automations: pipeline.automations || {}, automationsSeed: pipeline.automationsSeed || 0,
        });
      }
      setNewPipe("");
      onSwitch?.(ref.id);
      onClose();
    });
  };

  const removePipeline = () => {
    if (!others.length) return alert("No se puede eliminar el único embudo.");
    const dest = others.find((p) => p.id === target);
    if (inPipe.length && !dest) return alert("Elige a qué embudo pasan sus negociaciones.");
    if (!window.confirm(`¿Eliminar el embudo "${pipeline.name}"?${inPipe.length ? ` Sus ${inPipe.length} negociación(es) pasarán a "${dest.name}" (primera etapa).` : ""}`)) return;
    run(async () => {
      if (inPipe.length) {
        const first = flattenStages(getStages(dest, "pos"))[0];
        for (const d of inPipe) await crmUpdate("deals", d.id, { pipelineId: dest.id, board: "pos", stage: first?.id || "" });
      }
      await crmRemove("pipelines", pipeline.id);
      onSwitch?.(dest?.id || others[0].id);
      onClose();
    });
  };

  const tab = (b, label) => (
    <button className={`crm-btn ${board === b ? "" : "ghost"} sm`} onClick={() => setBoard(b)}>{label}</button>
  );

  return (
    <CrmModal title="Ajustes del embudo" onClose={onClose} maxWidth={600} footer={<button className="crm-btn" onClick={onClose}>Cerrar</button>}>
      <div className="crm-field">
        <label>Nombre del embudo</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
          <button className="crm-btn sm" onClick={saveName} disabled={busy || !name.trim() || name.trim() === pipeline.name}>Guardar</button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
        <h4 style={{ margin: 0, flex: 1 }}>Etapas</h4>
        {tab("pos", "Kanban")}
        {tab("neg", "Kanban Negativo")}
      </div>
      <div style={{ border: "1px solid #e3ecec", borderRadius: 8 }}>
        {stages.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: i < stages.length - 1 ? "1px solid #f0f4f4" : "none" }}>
            <span style={{ flex: 1 }}>
              {s.name} <small style={{ color: "var(--crm-muted)" }}>· {countIn(s.id)} negociación(es)</small>
            </span>
            <button className="crm-btn ghost sm" disabled={busy || i === 0} onClick={() => run(() => moveStage(pipeline, board, s.id, -1))} title="Subir">↑</button>
            <button className="crm-btn ghost sm" disabled={busy || i === stages.length - 1} onClick={() => run(() => moveStage(pipeline, board, s.id, 1))} title="Bajar">↓</button>
            <button className="crm-btn ghost sm" disabled={busy} onClick={() => rename(s)}>Renombrar</button>
            <button className="crm-btn ghost sm" disabled={busy} onClick={() => remove(s)} title="Eliminar etapa">✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          style={{ flex: 1, padding: "8px 10px", border: "1px solid #d8e4e4", borderRadius: 8 }}
          placeholder={`Nueva etapa del ${board === "neg" ? "Kanban Negativo" : "Kanban"}…`}
          value={newStage}
          onChange={(e) => setNewStage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="crm-btn sm" onClick={add} disabled={busy || !newStage.trim()}>+ Añadir etapa</button>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>
        Los cambios se guardan al momento. Lo que se envía al entrar en cada etapa se configura en ⚙ Reglas de automatización.
      </p>

      <h4 style={{ margin: "18px 0 8px" }}>Crear embudo nuevo</h4>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ flex: 1, padding: "8px 10px", border: "1px solid #d8e4e4", borderRadius: 8 }} placeholder="Nombre, p. ej. KIT DIGITAL" value={newPipe} onChange={(e) => setNewPipe(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <button className="crm-btn sm" onClick={create} disabled={busy || !newPipe.trim()}>+ Crear</button>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 6 }}>
        <input type="checkbox" style={{ width: "auto" }} checked={copyStages} onChange={(e) => setCopyStages(e.target.checked)} />
        Copiar las etapas y reglas de «{pipeline.name}» (si no, empieza con las etapas estándar)
      </label>

      {others.length > 0 && (
        <>
          <h4 style={{ margin: "18px 0 8px", color: "#b0304c" }}>Eliminar este embudo</h4>
          {inPipe.length > 0 && (
            <div className="crm-field" style={{ marginBottom: 8 }}>
              <label>Sus {inPipe.length} negociación(es) pasan a:</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Elige un embudo…</option>
                {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <button className="crm-btn ghost sm" style={{ color: "#b0304c", borderColor: "#f0c9d2" }} onClick={removePipeline} disabled={busy}>Eliminar «{pipeline.name}»</button>
        </>
      )}
    </CrmModal>
  );
}
