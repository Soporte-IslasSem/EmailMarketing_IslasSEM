import { useState } from "react";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmRemove } from "../lib/crm";
import "../crm.styles.css";

export default function Departments() {
  const { items, loading, orgId } = useCrmCollection("departments");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", manager: "", crmAccess: true });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await crmCreate("departments", orgId, form);
      setForm({ name: "", manager: "", crmAccess: true });
      setShowNew(false);
    } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); }
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div><h1>Departamentos</h1><p>Áreas de la empresa y su acceso al CRM.</p></div>
        <button className="crm-btn" onClick={() => setShowNew(true)}>+ Nuevo departamento</button>
      </div>
      {loading ? <div className="crm-loading">Cargando…</div> : (
        <table className="crm-table">
          <thead><tr><th>Departamento</th><th>Responsable</th><th>Acceso CRM</th><th></th></tr></thead>
          <tbody>
            {items.length ? items.map((d) => (
              <tr key={d.id}>
                <td><b>{d.name}</b></td>
                <td>{d.manager || "—"}</td>
                <td><span className={`crm-chip ${d.crmAccess ? "ok" : "bad"}`}>{d.crmAccess ? "Sí" : "No"}</span></td>
                <td style={{ textAlign: "right" }}><button className="crm-btn ghost sm" onClick={() => window.confirm("¿Eliminar?") && crmRemove("departments", d.id)}>Eliminar</button></td>
              </tr>
            )) : <tr><td colSpan="4" className="crm-empty">Aún no hay departamentos.</td></tr>}
          </tbody>
        </table>
      )}
      {showNew && (
        <CrmModal title="Nuevo departamento" onClose={() => setShowNew(false)}
          footer={<><button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button><button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear"}</button></>}>
          <div className="crm-field"><label>Nombre</label><input value={form.name} onChange={set("name")} autoFocus /></div>
          <div className="crm-field"><label>Responsable</label><input value={form.manager} onChange={set("manager")} /></div>
          <label style={{ display: "flex", gap: 8, fontSize: 14 }}><input type="checkbox" checked={form.crmAccess} onChange={(e) => setForm((f) => ({ ...f, crmAccess: e.target.checked }))} /> Con acceso al CRM</label>
        </CrmModal>
      )}
    </div>
  );
}
