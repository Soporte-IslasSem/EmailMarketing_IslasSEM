import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmRemove, logActivity, CLIENT_TIERS, fmtDate } from "../lib/crm";
import { CustomFieldsForm } from "../components/CustomFields";
import "../crm.styles.css";

const STAGES = ["Lead", "Contactado", "Propuesta", "Cliente"];
const stageClass = (s) => (s === "Cliente" ? "ok" : s === "Propuesta" ? "warn" : s === "Contactado" ? "info" : "");

const emptyForm = {
  firstName: "", lastName: "", email: "", phone: "", whatsapp: "",
  company: "", role: "", area: "", clientType: "nuevo", stage: "Lead",
  tags: "", responsable: "", dni: "", address: "", city: "", province: "", notes: "",
};

function nextClientId(items) {
  let max = 0;
  items.forEach((c) => { const m = /^CLI-(\d+)$/.exec(c.clientId || ""); if (m) max = Math.max(max, parseInt(m[1])); });
  return "CLI-" + String(max + 1).padStart(4, "0");
}
const initials = (name) => (name || "·").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function Contacts() {
  const { items, loading, orgId } = useCrmCollection("contacts");
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    let rows = [...items].sort((a, b) => (a.clientId || "").localeCompare(b.clientId || ""));
    if (stageFilter) rows = rows.filter((c) => (c.stage || "Lead") === stageFilter);
    if (t) rows = rows.filter((c) =>
      [c.firstName, c.lastName, c.email, c.company, c.role, c.responsable, c.clientId, (c.tags || []).join(" ")]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(t))
    );
    return rows;
  }, [items, term, stageFilter]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.firstName.trim() && !form.email.trim()) return;
    setSaving(true);
    try {
      const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
      const ref = await crmCreate("contacts", orgId, { ...form, tags, clientId: nextClientId(items) });
      await logActivity(orgId, { type: "Nota", title: `Contacto creado: ${form.firstName} ${form.lastName}`.trim(), entity: "contact", entityId: ref.id });
      setForm(emptyForm);
      setShowNew(false);
    } catch (e) {
      alert("No se pudo guardar el contacto: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Contactos</h1>
          <p>Toda tu base de datos en un solo lugar · {items.length} contactos</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="crm-btn ghost" onClick={() => alert("Importar contactos (CSV)")}>Importar</button>
          <button className="crm-btn" onClick={() => setShowNew(true)}>+ Añadir contacto</button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <span className="crm-chip">Todas las contactos ▾</span>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}><b>0</b> Entrante</span>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}><b>0</b> Planeado</span>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}><b>{items.length}</b> Más ▾</span>
        <input className="crm-search" style={{ margin: 0, flex: 1, minWidth: 200 }} placeholder="Filtrar y buscar…" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <select className="crm-search" style={{ margin: 0, maxWidth: 200 }} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">Todas las etapas</option>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="crm-loading">Cargando contactos…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>ID</th>
              <th>Contacto</th>
              <th>Empresa</th>
              <th>Etiquetas</th>
              <th>Etapa</th>
              <th>Responsable</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((c) => {
                const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || "(sin nombre)";
                const vip = c.clientType === "vip";
                return (
                  <tr key={c.id}>
                    <td><input type="checkbox" /></td>
                    <td><span className="crm-link" onClick={() => navigate(`/dashboard/crm/contacts/${c.id}`)}>{c.clientId || "—"}</span></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#e6f4f1", color: "#136b68", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, flex: "none" }}>{initials(name)}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{vip ? "⭐ " : ""}{name}</div>
                          <div style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>{c.email || "—"}{c.role ? ` · ${c.role}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.company ? <div><span className="crm-link" onClick={() => navigate("/dashboard/crm/companies")}>{c.company}</span>{c.area && <div style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>{c.area}</div>}</div> : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(c.tags || []).length ? c.tags.map((t) => <span key={t} className="crm-chip">{t}</span>) : "—"}
                      </div>
                    </td>
                    <td><span className={`crm-chip ${stageClass(c.stage)}`}>{c.stage || "Lead"}</span></td>
                    <td>{c.responsable ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 24, height: 24, borderRadius: "50%", background: "#e6f4f1", color: "#136b68", display: "inline-grid", placeItems: "center", fontWeight: 700, fontSize: 10 }}>{initials(c.responsable)}</span>{c.responsable}</span> : "—"}</td>
                    <td>{fmtDate(c.createdAt)}</td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan="8" className="crm-empty">Aún no hay contactos. Crea el primero con “+ Añadir contacto”.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && (
        <CrmModal
          title="Añadir contacto"
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Añadir contacto"}</button>
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
          <div className="crm-two">
            <div className="crm-field"><label>Empresa</label><input value={form.company} onChange={set("company")} /></div>
            <div className="crm-field"><label>Cargo</label><input value={form.role} onChange={set("role")} placeholder="Ej. Director Financiero" /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Área / Departamento</label><input value={form.area} onChange={set("area")} placeholder="Ej. Marketing" /></div>
            <div className="crm-field"><label>Responsable</label><input value={form.responsable} onChange={set("responsable")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Etapa</label>
              <select value={form.stage} onChange={set("stage")}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <div className="crm-field"><label>Tipología</label>
              <select value={form.clientType} onChange={set("clientType")}>{CLIENT_TIERS.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}</select>
            </div>
          </div>
          <div className="crm-field"><label>Etiquetas (separadas por coma)</label><input value={form.tags} onChange={set("tags")} placeholder="Newsletter, SEO, Cliente" /></div>
          <div className="crm-two">
            <div className="crm-field"><label>DNI / NIF</label><input value={form.dni} onChange={set("dni")} /></div>
            <div className="crm-field"><label>Ciudad / Provincia</label><input value={form.city} onChange={set("city")} /></div>
          </div>
          <div className="crm-field"><label>Notas</label><textarea rows="2" value={form.notes} onChange={set("notes")} /></div>
          <CustomFieldsForm entity="contacts" values={form.custom} onChange={(c) => setForm((f) => ({ ...f, custom: c }))} />
        </CrmModal>
      )}
    </div>
  );
}
