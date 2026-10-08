import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePipelines, getStages, flattenStages, STAGE_COLORS } from "../lib/pipelines";
import {
  getStageAutomations,
  addStageRule,
  removeStageRule,
  updateStageRule,
  seedDefaultAutomations,
  WHEN_OPTS,
  ACTION_OPTS,
  TO_OPTS,
} from "../lib/automations";
import { useCrmCollection } from "../lib/crm";
import { BUILTIN_LIST } from "../../forms/public/builtinForms";
import "../crm.styles.css";
import "../pipeline.styles.css";

export default function CrmAutomation() {
  const { pipelines } = usePipelines();
  const navigate = useNavigate();
  const pipeline = pipelines[0];
  const stages = pipeline ? flattenStages(getStages(pipeline, "pos")) : [];
  const { items: customForms } = useCrmCollection("crmForms");
  const formOpts = [
    ...BUILTIN_LIST.map((f) => [f.type, f.name]),
    ...customForms.filter((f) => f.active !== false).map((f) => [f.id, f.name]),
  ];
  // Al elegir formulario, el título por defecto pasa a ser su nombre (es el asunto del correo).
  const pickForm = (stageId, r, formId) => {
    const name = (formOpts.find((o) => o[0] === formId) || [])[1] || "";
    const generic = !r.title || r.title === "Nueva regla" || formOpts.some((o) => o[1] === r.title);
    updateStageRule(pipeline, stageId, r.id, { formId, ...(generic && name ? { title: name } : {}) });
  };

  useEffect(() => {
    if (pipeline && !pipeline.automations) seedDefaultAutomations(pipeline);
  }, [pipeline]);

  const addRule = (stageId) =>
    addStageRule(pipeline, stageId, { when: "immediately", action: "notification", to: "responsible", title: "Nueva regla" });

  return (
    <div className="crmpipe">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="crm-btn ghost sm" onClick={() => navigate("/dashboard/crm/pipeline")}>← Volver</button>
          <h1 style={{ margin: 0, fontSize: 22 }}>Automatización de ventas</h1>
        </div>

      </div>

      <>
          <div className="dealbar-l" style={{ marginBottom: 14 }}>
            <b style={{ fontSize: 15 }}>Reglas de automatización y disparadores</b>
            <div className="pipesel"><b>{pipeline?.name || "—"}</b></div>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Se ejecutan al mover una negociación a esa etapa.</span>
          </div>
          <div className="board deals" style={{ display: "flex" }}>
            {stages.map((s, i) => {
              const rules = getStageAutomations(pipeline, s.id);
              const color = STAGE_COLORS[i % STAGE_COLORS.length];
              return (
                <div key={s.id} style={{ flex: "0 0 250px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: color, color: "#fff", fontWeight: 700, fontSize: 12, padding: "8px 12px", borderRadius: 8, textAlign: "center", textTransform: "uppercase", letterSpacing: ".3px" }}>{s.name}</div>
                  <button className="autocol-add" style={{ border: "1px dashed #cdd8d8", background: "#fff", borderRadius: 8, padding: 6, color: "#6b7d7d", cursor: "pointer", fontWeight: 700 }} onClick={() => addRule(s.id)}>+ Añadir regla</button>
                  {rules.length ? rules.map((r) => (
                    <div key={r.id} className="crm-panel" style={{ margin: 0, padding: "10px 11px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <input value={r.title || ""} onChange={(e) => updateStageRule(pipeline, s.id, r.id, { title: e.target.value })} style={{ border: "none", fontWeight: 700, color: "var(--teal-dark)", fontSize: 12.5, width: "80%" }} />
                        <span style={{ color: "#b9c2c2", cursor: "pointer" }} onClick={() => removeStageRule(pipeline, s.id, r.id)}>✕</span>
                      </div>
                      <select value={r.when} onChange={(e) => updateStageRule(pipeline, s.id, r.id, { when: e.target.value })} style={ruleSel}>
                        {WHEN_OPTS.map((w) => <option key={w[0]} value={w[0]}>{w[1]}</option>)}
                      </select>
                      <select value={r.action} onChange={(e) => updateStageRule(pipeline, s.id, r.id, { action: e.target.value })} style={ruleSel}>
                        {ACTION_OPTS.map((a) => <option key={a[0]} value={a[0]}>{a[1]}</option>)}
                      </select>
                      {r.action === "form" && (
                        <select value={r.formId || ""} onChange={(e) => pickForm(s.id, r, e.target.value)} style={ruleSel}>
                          <option value="">Formulario: según el título (SEPA / Jurídicos)</option>
                          {formOpts.map((o) => <option key={o[0]} value={o[0]}>📄 {o[1]}</option>)}
                        </select>
                      )}
                      <select value={r.to} onChange={(e) => updateStageRule(pipeline, s.id, r.id, { to: e.target.value })} style={ruleSel}>
                        {TO_OPTS.map((t) => <option key={t[0]} value={t[0]}>→ {t[1]}</option>)}
                      </select>
                    </div>
                  )) : (
                    <div style={{ fontSize: 12.5, color: "#5b6b6a", padding: 4 }}>Sin reglas. Pulsa “+ Añadir regla”.</div>
                  )}
                </div>
              );
            })}
          </div>
      </>
    </div>
  );
}

const ruleSel = { width: "100%", border: "1px solid #e3eaea", borderRadius: 6, padding: "5px 7px", fontSize: 12.5, marginBottom: 6, background: "#fff", cursor: "pointer" };
