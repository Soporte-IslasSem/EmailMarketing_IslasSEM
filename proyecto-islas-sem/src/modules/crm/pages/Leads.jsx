import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrmModal from "../components/CrmModal";
import LeadImportModal from "../components/LeadImportModal";
import {
  useCrmCollection,
  crmCreate,
  crmUpdate,
  crmRemove,
  logActivity,
  fmtDate,
  money,
  LEAD_SOURCES,
  LEAD_STATUSES,
  SOURCE_META,
} from "../lib/crm";
import { usePipelines, getStages, flattenStages } from "../lib/pipelines";
import { runStageAutomations } from "../lib/automations";
import { CustomFieldsForm } from "../components/CustomFields";
import "../crm.styles.css";
import { submissionLabel, submissionEntries } from "../../forms/public/builtinForms";

const empty = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  whatsapp: "",
  company: "",
  source: "Manual",
  status: "Nuevo",
  responsable: "",
  estimatedValue: 0,
  notes: "",
};

const statusClass = (s) =>
  s === "Convertido" || s === "Cualificado" ? "ok" : s === "No cualificado" ? "bad" : s === "Contactado" ? "info" : "warn";

const initials = (name) => (name || "·").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function SourceChip({ source }) {
  const m = SOURCE_META[source] || SOURCE_META.Manual;
  return (
    <span className="crm-chip" style={{ background: m.bg, color: m.color }}>
      {m.icon} {source}
    </span>
  );
}

export default function Leads() {
  const { items, loading, orgId } = useCrmCollection("leads");
  const { pipelines } = usePipelines();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [convertLead, setConvertLead] = useState(null);
  const [historyLead, setHistoryLead] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const { items: contacts } = useCrmCollection("contacts");
  const { items: deals } = useCrmCollection("deals");

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rows = [...items].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (!t) return rows;
    return rows.filter((l) =>
      [l.firstName, l.lastName, l.email, l.company, l.source, l.status, l.responsable]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t))
    );
  }, [items, term]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.firstName.trim() && !form.email.trim()) return;
    setSaving(true);
    try {
      await crmCreate("leads", orgId, { ...form, estimatedValue: Number(form.estimatedValue) || 0 });
      setForm(empty);
      setShowNew(false);
    } catch (e) {
      alert("No se pudo guardar el prospecto: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Conversión completa tipo Bitrix: crea Contacto (+ Empresa) (+ Negociación) enlazados.
  const runConvert = async (lead, opts) => {
    const name = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.email || "Contacto";
    let companyId = "";
    if (opts.company && lead.company) {
      const cref = await crmCreate("companies", orgId, {
        name: lead.company,
        email: lead.email || "",
        phone: lead.phone || lead.whatsapp || "",
        fromLeadId: lead.id,
      });
      companyId = cref.id;
    }
    const contactRef = await crmCreate("contacts", orgId, {
      firstName: lead.firstName || "",
      lastName: lead.lastName || "",
      email: lead.email || "",
      phone: lead.phone || lead.whatsapp || "",
      company: lead.company || "",
      companyId,
      clientType: "",
      relation: "nuevo",
      stage: "Lead",
      notes: lead.notes || "",
      source: lead.source || "",
      responsable: lead.responsable || "",
      custom: lead.custom || {},
      fromLeadId: lead.id,
    });

    // Negociaciones que ya creó un formulario para este prospecto: pasan al contacto nuevo.
    const leadDeals = deals.filter((d) => d.leadId === lead.id);
    await Promise.all(leadDeals.map((d) => crmUpdate("deals", d.id, {
      contactId: contactRef.id, contact: d.contact || name, contactEmail: d.contactEmail || lead.email || "",
      ...(companyId ? { companyId } : {}),
    })));
    let dealId = leadDeals.find((d) => d.status !== "ganado" && d.status !== "perdido")?.id || "";
    if (opts.deal && !dealId) {
      const pipeline = pipelines[0];
      const stages = pipeline ? flattenStages(getStages(pipeline, "pos")) : [];
      const first = stages[0];
      const dealRef = await crmCreate("deals", orgId, {
        title: opts.dealTitle || `Negociación · ${name}`,
        amount: Number(opts.amount) || Number(lead.estimatedValue) || 0,
        board: "pos",
        pipelineId: pipeline?.id || "",
        stage: first?.id || "",
        contact: name,
        contactId: contactRef.id,
        contactEmail: lead.email || "",
        company: lead.company || "",
        companyId,
        responsable: lead.responsable || "",
        source: lead.source || "",
        clientType: "nuevo",
        notes: lead.notes || "",
        fromLeadId: lead.id,
      });
      dealId = dealRef.id;
      await logActivity(orgId, { type: "Nota", title: `Negociación creada desde prospecto: ${name}`, entity: "deal", entityId: dealId, contactId: contactRef.id });
      if (pipeline && first) runStageAutomations(pipeline, { id: dealId, title: opts.dealTitle || name, responsable: lead.responsable, board: "pos", contactId: contactRef.id, contact: name, contactEmail: lead.email || "" }, first.id, orgId);
    }

    await crmUpdate("leads", lead.id, {
      status: "Convertido",
      convertedContactId: contactRef.id,
      convertedCompanyId: companyId,
      convertedDealId: dealId,
    });
    await logActivity(orgId, {
      type: "Nota",
      title: `Prospecto convertido: ${name}${opts.company && lead.company ? " + empresa" : ""}${opts.deal ? " + negociación" : ""}`,
      entity: "contact",
      entityId: contactRef.id,
    });
    setConvertLead(null);
    if (dealId) navigate(`/dashboard/crm/deals/${dealId}`);
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Prospectos</h1>
          <p>Leads sin cualificar · conviértelos en contactos y negociaciones · {items.length} prospectos</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="crm-btn ghost" onClick={() => setShowImport(true)}>Importar</button>
          <button className="crm-btn" onClick={() => setShowNew(true)}>+ Crear prospecto</button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        <span className="crm-chip">Todas las prospectos ▾</span>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}><b>0</b> Entrante</span>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}><b>0</b> Planeado</span>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}><b>{items.length}</b> Más ▾</span>
        <input className="crm-search" style={{ margin: 0, flex: 1, minWidth: 200 }} placeholder="Filtrar y buscar…" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>

      {loading ? (
        <div className="crm-loading">Cargando prospectos…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr>
              <th>Prospecto</th>
              <th>Empresa</th>
              <th>Etapa</th>
              <th>WhatsApp</th>
              <th>Recorrido del cliente</th>
              <th>Responsable</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((l) => {
                const name = `${l.firstName || ""} ${l.lastName || ""}`.trim() || "(sin nombre)";
                return (
                  <tr key={l.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#e6f4f1", color: "#136b68", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, flex: "none" }}>{initials(name)}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{name}</div>
                          <div style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>{l.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td>{l.company || "—"}</td>
                    <td><span className={`crm-chip ${statusClass(l.status)}`}>{l.status}</span></td>
                    <td>{l.whatsapp || l.phone || "—"}</td>
                    <td><SourceChip source={l.source} /></td>
                    <td>{l.responsable || "—"}</td>
                    <td>{fmtDate(l.createdAt)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="crm-btn ghost sm" onClick={() => setHistoryLead(l)} title="Correos, formularios y actividad">📜</button>{" "}
                      {l.status !== "Convertido" && <button className="crm-btn sm" onClick={() => setConvertLead(l)}>Convertir</button>}{" "}
                      <button className="crm-btn ghost sm" onClick={() => window.confirm("¿Eliminar prospecto?") && crmRemove("leads", l.id)}>✕</button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="crm-empty">Aún no hay prospectos. Crea el primero con “+ Crear prospecto”.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && (
        <CrmModal
          title="Crear prospecto"
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear prospecto"}</button>
            </>
          }
        >
          <div className="crm-two">
            <div className="crm-field"><label>Nombre</label><input value={form.firstName} onChange={set("firstName")} autoFocus /></div>
            <div className="crm-field"><label>Apellidos</label><input value={form.lastName} onChange={set("lastName")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Email</label><input type="email" value={form.email} onChange={set("email")} /></div>
            <div className="crm-field"><label>WhatsApp / Teléfono</label><input value={form.whatsapp} onChange={set("whatsapp")} /></div>
          </div>
          <div className="crm-field"><label>Empresa</label><input value={form.company} onChange={set("company")} /></div>
          <div className="crm-two">
            <div className="crm-field">
              <label>Recorrido del cliente (origen)</label>
              <select value={form.source} onChange={set("source")}>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <div className="crm-field">
              <label>Etapa</label>
              <select value={form.status} onChange={set("status")}>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Responsable</label><input value={form.responsable} onChange={set("responsable")} /></div>
            <div className="crm-field"><label>Valor estimado (€)</label><input type="number" value={form.estimatedValue} onChange={set("estimatedValue")} /></div>
          </div>
          <div className="crm-field"><label>Notas</label><textarea rows="2" value={form.notes} onChange={set("notes")} /></div>
          <CustomFieldsForm entity="leads" values={form.custom} onChange={(c) => setForm((f) => ({ ...f, custom: c }))} />
        </CrmModal>
      )}

      {showImport && <LeadImportModal orgId={orgId} existingLeads={items} existingContacts={contacts} onClose={() => setShowImport(false)} />}
      {historyLead && <LeadHistoryModal lead={historyLead} onClose={() => setHistoryLead(null)} />}
      {convertLead && <ConvertModal lead={convertLead} onClose={() => setConvertLead(null)} onConfirm={runConvert} />}
    </div>
  );
}

function ConvertModal({ lead, onClose, onConfirm }) {
  const name = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.email || "Contacto";
  const [company, setCompany] = useState(!!lead.company);
  const [deal, setDeal] = useState(true);
  const [dealTitle, setDealTitle] = useState(`Negociación · ${name}`);
  const [amount, setAmount] = useState(lead.estimatedValue || 0);
  const [saving, setSaving] = useState(false);
  const confirm = async () => {
    setSaving(true);
    try { await onConfirm(lead, { company, deal, dealTitle, amount }); } finally { setSaving(false); }
  };
  return (
    <CrmModal
      title="Convertir prospecto"
      onClose={onClose}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="crm-btn" onClick={confirm} disabled={saving}>{saving ? "Convirtiendo…" : "Convertir"}</button>
        </>
      }
    >
      <p style={{ margin: 0 }}>Se creará un <b>contacto</b> a partir de <b>{name}</b>. Elige qué más generar:</p>
      <label className="conv-opt">
        <input type="checkbox" checked disabled /> <span>👤 Contacto <small>(siempre)</small></span>
      </label>
      <label className="conv-opt" style={{ opacity: lead.company ? 1 : 0.5 }}>
        <input type="checkbox" checked={company} disabled={!lead.company} onChange={(e) => setCompany(e.target.checked)} />
        <span>🏢 Empresa {lead.company ? <b>({lead.company})</b> : <small>(el prospecto no tiene empresa)</small>}</span>
      </label>
      <label className="conv-opt">
        <input type="checkbox" checked={deal} onChange={(e) => setDeal(e.target.checked)} />
        <span>💼 Negociación <small>(entra en el embudo)</small></span>
      </label>
      {deal && (
        <div style={{ borderLeft: "3px solid var(--teal)", paddingLeft: 12, marginTop: 6 }}>
          <div className="crm-field"><label>Título de la negociación</label><input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} /></div>
          <div className="crm-field"><label>Importe estimado (€)</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <p className="sub" style={{ fontSize: 12, color: "var(--crm-muted)", margin: 0 }}>Entrará en <b>{money(amount)}</b> en la primera etapa y disparará sus automatizaciones.</p>
        </div>
      )}
    </CrmModal>
  );
}

// Historial del prospecto: correos recibidos, formularios rellenados y notas
// (todo lo que entró antes de convertirlo en contacto).
function LeadHistoryModal({ lead, onClose }) {
  const { items: activities } = useCrmCollection("activities");
  const { items: formSubs } = useCrmCollection("formSubmissions");
  const name = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.email || "Prospecto";
  const acts = activities
    .filter((a) => a.leadId === lead.id || (a.entity === "lead" && a.entityId === lead.id))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const forms = formSubs.filter((f) => f.leadId === lead.id);
  return (
    <CrmModal title={`Historial · ${name}`} onClose={onClose} footer={<button className="crm-btn" onClick={onClose}>Cerrar</button>}>
      {forms.map((f) => (
        <details key={f.id} style={{ borderBottom: "1px solid #eef3f3", padding: "6px 0" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13.5 }}>
            📋 {submissionLabel(f)} · {fmtDate(f.createdAt)}
          </summary>
          <dl className="crm-dl" style={{ marginTop: 6 }}>
            {submissionEntries(f).map(([k, v]) => <div className="row" key={k}><dt>{k}</dt><dd>{String(v) || "—"}</dd></div>)}
          </dl>
        </details>
      ))}
      {acts.length ? (
        <ul className="crm-timeline">
          {acts.map((a) => (
            <li key={a.id} className="crm-tl-item">
              <span className="dot" />
              <div className="tl-t">{a.type}: {a.title}</div>
              {a.body && (
                <details style={{ fontSize: 13, color: "var(--crm-muted)" }}>
                  <summary style={{ cursor: "pointer" }}>Ver correo{a.from ? ` de ${a.from}` : ""}</summary>
                  <div style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto", marginTop: 6, color: "#2a3a3a" }}>{a.body}</div>
                </details>
              )}
              <div className="tl-m">{fmtDate(a.createdAt)}</div>
            </li>
          ))}
        </ul>
      ) : !forms.length && <p style={{ color: "var(--crm-muted)", margin: 0 }}>Sin correos ni formularios todavía.</p>}
    </CrmModal>
  );
}
