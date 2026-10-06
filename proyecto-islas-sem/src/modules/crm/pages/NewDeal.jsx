import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrmCollection, crmCreate, logActivity, money } from "../lib/crm";
import { usePipelines, getStages, flattenStages, STAGE_COLORS, CLIENT_TIERS } from "../lib/pipelines";
import { LEAD_SOURCES } from "../lib/crm";
import "../crm.styles.css";
import "../pipeline.styles.css";

export default function NewDeal() {
  const navigate = useNavigate();
  const { pipelines } = usePipelines();
  const { items: contacts } = useCrmCollection("contacts");
  const pipeline = pipelines[0];
  const stages = useMemo(() => (pipeline ? flattenStages(getStages(pipeline, "pos")) : []), [pipeline]);

  const [form, setForm] = useState({
    title: "", amount: 0, stage: "", type: "Sales", source: "Manual",
    contact: "", company: "", responsable: "", clientType: "nuevo", priceType: "producto", comment: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const stage = form.stage || stages[0]?.id;
  const ci = stages.findIndex((s) => s.id === stage);
  const acc = STAGE_COLORS[(ci < 0 ? 0 : ci) % STAGE_COLORS.length];

  const save = async () => {
    if (!form.title.trim() || !pipeline) return;
    setSaving(true);
    try {
      const match = contacts.find((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim().toLowerCase() === form.contact.trim().toLowerCase());
      const ref = await crmCreate("deals", pipeline.orgId, {
        pipelineId: pipeline.id, board: "pos", stage,
        title: form.title.trim(), amount: Number(form.amount) || 0,
        type: form.type, source: form.source,
        contact: form.contact.trim(), contactId: match?.id || null, company: form.company.trim(),
        responsable: form.responsable.trim(), clientType: form.clientType, priceType: form.priceType, notes: form.comment,
      });
      await logActivity(pipeline.orgId, { type: "Nota", title: `Negociación creada: ${form.title} (${money(form.amount)})`, entity: "deal", entityId: ref.id });
      navigate(`/dashboard/crm/deals/${ref.id}`);
    } catch (e) {
      alert("No se pudo crear: " + e.message);
      setSaving(false);
    }
  };

  if (!pipeline) return <div className="crmpipe crm"><div className="crm-loading">Cargando…</div></div>;

  return (
    <div className="crmpipe dficha">
      <div className="dficha__head">
        <div>
          <button className="crm-btn ghost sm" onClick={() => navigate("/dashboard/crm/pipeline")}>← Negociaciones</button>
          <h1 className="dficha__title" style={{ marginTop: 10 }}>Nueva negociación</h1>
        </div>
      </div>

      {/* Barra de etapas (elige la inicial) */}
      <div className="dstage-bar">
        {stages.map((s, i) => (
          <div key={s.id} className={`dstage ${i <= ci ? "on" : ""}`} style={i <= ci ? { background: acc } : undefined} onClick={() => setForm((f) => ({ ...f, stage: s.id }))}>{s.name}</div>
        ))}
        <div className="dstage dstage-close">Cerrar negociación</div>
      </div>

      <div className="dtabs"><button className="on">General</button></div>

      <div className="dcols">
        <div className="cd-col">
          <div className="crm-panel">
            <h4 className="cd-h">Datos de la negociación</h4>
            <div className="crm-field"><label>Nombre</label><input value={form.title} onChange={set("title")} autoFocus placeholder="Ej. Contrato anual SEO + SEM" /></div>
            <div className="crm-two">
              <div className="crm-field"><label>Tipo de negociación</label><input value={form.type} onChange={set("type")} /></div>
              <div className="crm-field"><label>Origen</label>
                <select value={form.source} onChange={set("source")}>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
              </div>
            </div>
            <div className="crm-two">
              <div className="crm-field"><label>Importe (€)</label><input type="number" value={form.amount} onChange={set("amount")} /></div>
              <div className="crm-field"><label>Etapa</label>
                <select value={stage} onChange={set("stage")}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </div>
            </div>
            <div className="crm-field"><label>Contacto</label>
              <input value={form.contact} onChange={set("contact")} list="nd-contacts" placeholder="Nombre del contacto" />
              <datalist id="nd-contacts">{contacts.map((c) => <option key={c.id} value={`${c.firstName || ""} ${c.lastName || ""}`.trim()} />)}</datalist>
            </div>
            <div className="crm-two">
              <div className="crm-field"><label>Empresa</label><input value={form.company} onChange={set("company")} /></div>
              <div className="crm-field"><label>Responsable</label><input value={form.responsable} onChange={set("responsable")} /></div>
            </div>
            <div className="crm-two">
              <div className="crm-field"><label>Tipología</label>
                <select value={form.clientType} onChange={set("clientType")}>{Object.entries(CLIENT_TIERS).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}</select>
              </div>
              <div className="crm-field"><label>Tipo de precio</label>
                <select value={form.priceType} onChange={set("priceType")}><option value="producto">Precio de producto</option><option value="estimado">Precio estimado</option></select>
              </div>
            </div>
            <div className="crm-field"><label>Comentario</label><textarea rows="3" value={form.comment} onChange={set("comment")} /></div>
          </div>
        </div>
        <div className="cd-col">
          <div className="crm-panel">
            <h4 className="cd-h">Actividad</h4>
            <p style={{ color: "var(--crm-muted)", fontSize: 14, margin: 0 }}>Planifique su siguiente acción tras crear la negociación (llamada, correo, reunión…).</p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line2)" }}>
        <button className="crear-split" style={{ background: "#39a852" }} onClick={save} disabled={saving}>{saving ? "Guardando…" : "GUARDAR"}</button>
        <button className="crm-btn ghost" onClick={() => navigate("/dashboard/crm/pipeline")}>CANCELAR</button>
      </div>
    </div>
  );
}
