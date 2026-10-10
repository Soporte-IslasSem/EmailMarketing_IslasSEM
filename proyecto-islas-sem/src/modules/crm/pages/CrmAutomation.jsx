import { useEffect, useState } from "react";
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
import { usePerms } from "../lib/permissions";
import "../crm.styles.css";
import "../pipeline.styles.css";

export default function CrmAutomation() {
  const { pipelines } = usePipelines();
  const navigate = useNavigate();
  const [pipeId, setPipeId] = useState("");
  const pipeline = pipelines.find((p) => p.id === pipeId) || pipelines[0];
  const { isAdmin } = usePerms();
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
            <select className="pipesel" value={pipeline?.id || ""} onChange={(e) => setPipeId(e.target.value)} style={{ fontWeight: 700 }}>
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="crm-panel" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
            <b>Cómo funciona (24/7, en el servidor):</b> cuando una negociación entra en una etapa —la mueva una persona, un
            formulario o el propio sistema— se ejecutan sus reglas. Las de <b>Enviar formulario / correo</b> mandan el mensaje al
            cliente y la negociación queda <b>esperando respuesta</b>: si rellena el formulario o contesta el correo pasa sola a la
            <b> siguiente etapa</b> (y se ejecutan las reglas de esa etapa); si no responde en las horas indicadas pasa al
            <b> Kanban Negativo</b>. Con <b>Interés</b> la regla solo se aplica a negociaciones de ese tema (p. ej. «rgpd» o
            «página web»: se busca en productos, título y notas).
            {!isAdmin && <div style={{ marginTop: 6, color: "#b0304c" }}>🔒 Solo los administradores pueden cambiar las reglas.</div>}
          </div>
          <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
                      {(r.action === "form" || r.action === "email") ? (
                        <>
                          <input defaultValue={r.subject || ""} placeholder={`Asunto (por defecto: ${r.title || "Documento"} · ISLAS SEM)`} onBlur={(e) => e.target.value !== (r.subject || "") && updateStageRule(pipeline, s.id, r.id, { subject: e.target.value })} style={ruleIn} />
                          <textarea defaultValue={r.message || ""} rows={4} placeholder="Mensaje al cliente (si lo dejas vacío se usa un texto estándar). Empieza solo con «Hola <nombre>,»." onBlur={(e) => e.target.value !== (r.message || "") && updateStageRule(pipeline, s.id, r.id, { message: e.target.value })} style={{ ...ruleIn, resize: "vertical" }} />
                          <label style={ruleLbl}>
                            Si no responde en
                            <input type="number" min="0" defaultValue={r.waitH ?? 72} onBlur={(e) => updateStageRule(pipeline, s.id, r.id, { waitH: Math.max(0, Number(e.target.value) || 0) })} style={{ ...ruleIn, width: 70, margin: "0 6px" }} />
                            h → Negativo <span style={{ color: "#9aa8a8" }}>(0 = no esperar)</span>
                          </label>
                        </>
                      ) : (
                        <select value={r.to} onChange={(e) => updateStageRule(pipeline, s.id, r.id, { to: e.target.value })} style={ruleSel}>
                          {TO_OPTS.map((t) => <option key={t[0]} value={t[0]}>→ {t[1]}</option>)}
                        </select>
                      )}
                      <input defaultValue={r.interest || ""} placeholder="Interés (vacío = todas). Ej.: rgpd, kit digital" onBlur={(e) => e.target.value !== (r.interest || "") && updateStageRule(pipeline, s.id, r.id, { interest: e.target.value })} style={ruleIn} title="Palabras separadas por coma: la regla solo se aplica si la negociación habla de eso" />
                    </div>
                  )) : (
                    <div style={{ fontSize: 12.5, color: "#5b6b6a", padding: 4 }}>Sin reglas. Pulsa “+ Añadir regla”.</div>
                  )}
                </div>
              );
            })}
          </div>
          </fieldset>
      </>
    </div>
  );
}

const ruleIn = { width: "100%", boxSizing: "border-box", border: "1px solid #e3eaea", borderRadius: 6, padding: "5px 7px", fontSize: 12.5, marginBottom: 6, fontFamily: "inherit" };
const ruleLbl = { display: "flex", alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "#5b6b6a", marginBottom: 6 };
const ruleSel = { width: "100%", border: "1px solid #e3eaea", borderRadius: 6, padding: "5px 7px", fontSize: 12.5, marginBottom: 6, background: "#fff", cursor: "pointer" };
