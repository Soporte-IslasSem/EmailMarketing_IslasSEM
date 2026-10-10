import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCrmCollection, crmCreate, logActivity, money } from "../lib/crm";
import { usePipelines, getStages, flattenStages, STAGE_COLORS, CLIENT_TIERS } from "../lib/pipelines";
import { LEAD_SOURCES, DEAL_TYPES } from "../lib/crm";
import { CustomFieldsForm } from "../components/CustomFields";
import { CreateFieldModal, ExtraFieldsEditor } from "../components/DealFields";
import "../crm.styles.css";
import "../pipeline.styles.css";

// Alta completa de negociación (como el prototipo). Desde el "+" de una columna del
// Kanban llega con ?pipeline=<id>&board=<pos|neg>&stage=<id> para caer en esa etapa.
export default function NewDeal() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { pipelines } = usePipelines();
  const { items: contacts, orgId } = useCrmCollection("contacts");
  const { items: employees } = useCrmCollection("employees");
  const pipeline = pipelines.find((p) => p.id === params.get("pipeline")) || pipelines[0];
  const board = params.get("board") === "neg" ? "neg" : "pos";
  const stages = useMemo(() => (pipeline ? flattenStages(getStages(pipeline, board)) : []), [pipeline, board]);
  const people = useMemo(
    () => employees.map((e) => `${e.firstName || ""} ${e.lastName || ""}`.trim() || e.email).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [employees]
  );

  const [form, setForm] = useState({
    title: "", amount: 0, stage: params.get("stage") || "", type: "Sales", source: "Manual", sourceInfo: "",
    startDate: new Date().toISOString().slice(0, 10), contact: "", company: "", responsable: "",
    openToAll: true, observers: "", clientType: "nuevo", priceType: "producto", comment: "",
    custom: {}, extraFields: [],
  });
  const [saving, setSaving] = useState(false);
  const [newField, setNewField] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const stage = stages.some((s) => s.id === form.stage) ? form.stage : stages[0]?.id;
  const ci = stages.findIndex((s) => s.id === stage);
  const acc = STAGE_COLORS[(ci < 0 ? 0 : ci) % STAGE_COLORS.length];
  const back = () => navigate("/dashboard/crm/pipeline");

  const save = async () => {
    if (!form.title.trim()) return alert("Ponle un nombre a la negociación.");
    if (!pipeline) return;
    setSaving(true);
    try {
      const match = contacts.find((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim().toLowerCase() === form.contact.trim().toLowerCase());
      const data = {
        pipelineId: pipeline.id, board, stage,
        title: form.title.trim(), amount: Number(form.amount) || 0,
        type: form.type, source: form.source, sourceInfo: form.sourceInfo.trim(), startDate: form.startDate,
        contact: form.contact.trim(), contactId: match?.id || null, contactEmail: match?.email || "", company: form.company.trim(),
        responsable: form.responsable.trim(), openToAll: form.openToAll, observers: form.observers.trim(),
        clientType: form.clientType, priceType: form.priceType, notes: form.comment,
        custom: form.custom, extraFields: form.extraFields,
      };
      const ref = await crmCreate("deals", pipeline.orgId, data);
      await logActivity(pipeline.orgId, { type: "Nota", title: `Negociación creada: ${data.title} (${money(data.amount)})`, entity: "deal", entityId: ref.id, contactId: match?.id || "" });
      navigate(`/dashboard/crm/deals/${ref.id}`);
    } catch (e) {
      alert("No se pudo crear: " + e.message);
      setSaving(false);
    }
  };

  if (!pipeline) return <div className="crmpipe crm"><div className="crm-loading">Cargando…</div></div>;

  const actions = (
    <>
      <button className="crear-split" style={{ background: "#39a852" }} onClick={save} disabled={saving}>{saving ? "Guardando…" : "GUARDAR"}</button>
      <button className="crm-btn ghost" onClick={back}>CANCELAR</button>
    </>
  );

  return (
    <div className="crmpipe dficha">
      <div className="dficha__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <button className="crm-btn ghost sm" onClick={back}>← Negociaciones</button>
          <h1 className="dficha__title" style={{ marginTop: 10 }}>
            Nueva negociación <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>· {pipeline.name}{board === "neg" ? " · Kanban Negativo" : ""}</span>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>{actions}</div>
      </div>

      {/* Barra de etapas (elige la inicial) */}
      <div className="dstage-bar">
        {stages.map((s, i) => (
          <div key={s.id} className={`dstage ${i <= ci ? "on" : ""}`} style={i <= ci ? { background: acc } : undefined} onClick={() => setForm((f) => ({ ...f, stage: s.id }))}>{s.name}</div>
        ))}
      </div>

      <div className="dtabs"><button className="on">General</button></div>

      <div className="dcols">
        <div className="cd-col">
          <div className="crm-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 className="cd-h" style={{ margin: 0 }}>Sobre la negociación</h4>
              <span className="crm-link" style={{ fontSize: 12.5 }} onClick={() => setNewField(true)}>+ Crear campo</span>
            </div>
            <div className="crm-field"><label>Nombre de la negociación</label><input value={form.title} onChange={set("title")} autoFocus placeholder="Ej. Contrato anual SEO + SEM" /></div>
            <div className="crm-two">
              <div className="crm-field"><label>Tipo de negociación</label>
                <select value={form.type} onChange={set("type")}>{DEAL_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div className="crm-field"><label>Origen (recorrido del cliente)</label>
                <select value={form.source} onChange={set("source")}>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
              </div>
            </div>
            <div className="crm-field"><label>Origen de información</label><textarea rows="2" value={form.sourceInfo} onChange={set("sourceInfo")} placeholder="Notas del origen…" /></div>
            <div className="crm-two">
              <div className="crm-field"><label>Fecha de inicio</label><input type="date" value={form.startDate} onChange={set("startDate")} /></div>
              <div className="crm-field"><label>Importe (€)</label><input type="number" value={form.amount} onChange={set("amount")} /></div>
            </div>
            <div className="crm-two">
              <div className="crm-field"><label>Etapa</label>
                <select value={stage} onChange={set("stage")}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </div>
              <div className="crm-field"><label>Tipología</label>
                <select value={form.clientType} onChange={set("clientType")}>{Object.entries(CLIENT_TIERS).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}</select>
              </div>
            </div>
            <div className="crm-two">
              <div className="crm-field"><label>Contacto</label>
                <input value={form.contact} onChange={set("contact")} list="nd-contacts" placeholder="Nombre del contacto" />
                <datalist id="nd-contacts">{contacts.map((c) => <option key={c.id} value={`${c.firstName || ""} ${c.lastName || ""}`.trim()} />)}</datalist>
              </div>
              <div className="crm-field"><label>Empresa</label><input value={form.company} onChange={set("company")} placeholder="Empresa (opcional)" /></div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "4px 0 10px" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={form.openToAll} onChange={set("openToAll")} /> Disponible para todos
            </label>
            <div className="crm-two">
              <div className="crm-field"><label>Responsable</label>
                <input value={form.responsable} onChange={set("responsable")} list="nd-people" placeholder="Quién lleva la negociación" />
                <datalist id="nd-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
              </div>
              <div className="crm-field"><label>Observadores</label>
                <input value={form.observers} onChange={set("observers")} placeholder="Nombres separados por coma" />
              </div>
            </div>
            <div className="crm-field"><label>Tipo de precio</label>
              <select value={form.priceType} onChange={set("priceType")}><option value="producto">Precio de producto</option><option value="estimado">Precio estimado</option></select>
            </div>
            <div className="crm-field"><label>Comentario</label><textarea rows="3" value={form.comment} onChange={set("comment")} placeholder="Comentario…" /></div>
            <CustomFieldsForm entity="deals" values={form.custom} onChange={(custom) => setForm((f) => ({ ...f, custom }))} />
            <ExtraFieldsEditor value={form.extraFields} onChange={(extraFields) => setForm((f) => ({ ...f, extraFields }))} />
          </div>
        </div>
        <div className="cd-col">
          <div className="crm-panel">
            <h4 className="cd-h">Actividad</h4>
            <p style={{ color: "var(--crm-muted)", fontSize: 14, margin: 0 }}>Planifique su siguiente acción tras crear la negociación (llamada, correo, reunión…).</p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line2)" }}>{actions}</div>

      {newField && (
        <CreateFieldModal
          orgId={orgId}
          onClose={() => setNewField(false)}
          onAddExtra={(f) => setForm((x) => ({ ...x, extraFields: [...x.extraFields, f] }))}
        />
      )}
    </div>
  );
}
