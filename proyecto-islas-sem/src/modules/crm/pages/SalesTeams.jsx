import { useState } from "react";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove } from "../lib/crm";
import "../crm.styles.css";

export default function SalesTeams() {
  const { items, loading, orgId } = useCrmCollection("salesteams");
  const { items: employees } = useCrmCollection("employees");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", type: "calle", members: [] });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await crmCreate("salesteams", orgId, form);
      setForm({ name: "", type: "calle", members: [] });
      setShowNew(false);
    } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); }
  };

  const addMember = async (team, name) => { if (name) crmUpdate("salesteams", team.id, { members: [...(team.members || []), name] }); };
  const removeMember = (team, i) => crmUpdate("salesteams", team.id, { members: (team.members || []).filter((_, j) => j !== i) });

  return (
    <div className="crm">
      <div className="crm__top">
        <div><h1>Equipos comerciales</h1><p>Equipo que va a la calle y equipo que trabaja dentro. Alimenta las alertas de oferta aceptada.</p></div>
        <button className="crm-btn" onClick={() => setShowNew(true)}>+ Alta de equipo</button>
      </div>

      {loading ? <div className="crm-loading">Cargando…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
          {items.length ? items.map((t) => (
            <div className="crm-panel" key={t.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ margin: 0 }}>{t.name}</h4>
                <span className={`crm-chip ${t.type === "calle" ? "warn" : "info"}`}>{t.type === "calle" ? "🚶 A la calle" : "🏢 Interno"}</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {(t.members || []).length ? t.members.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, background: "#f4f7f7", borderRadius: 8, padding: "6px 10px" }}>
                    <span>{m}</span>
                    <button className="crm-btn ghost sm" onClick={() => removeMember(t, i)}>×</button>
                  </div>
                )) : <p style={{ color: "var(--crm-muted)", fontSize: 13, margin: 0 }}>Sin miembros.</p>}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <select id={`m_${t.id}`} className="crm-search" style={{ margin: 0, maxWidth: "none", flex: 1 }} defaultValue="">
                  <option value="">Añadir miembro…</option>
                  {employees.map((e) => <option key={e.id} value={`${e.firstName || ""} ${e.lastName || ""}`.trim()}>{`${e.firstName || ""} ${e.lastName || ""}`.trim()}</option>)}
                </select>
                <button className="crm-btn sm" onClick={() => { const s = document.getElementById(`m_${t.id}`); if (s.value) { addMember(t, s.value); s.value = ""; } }}>Añadir</button>
              </div>
              <button className="crm-btn ghost sm" style={{ marginTop: 10 }} onClick={() => window.confirm("¿Eliminar equipo?") && crmRemove("salesteams", t.id)}>Eliminar equipo</button>
            </div>
          )) : <p className="crm-empty">Aún no hay equipos. Crea el de calle y el interno.</p>}
        </div>
      )}

      {showNew && (
        <CrmModal title="Alta de equipo" onClose={() => setShowNew(false)}
          footer={<><button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button><button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear equipo"}</button></>}>
          <div className="crm-field"><label>Nombre del equipo</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus placeholder="Ej. Equipo de calle" /></div>
          <div className="crm-field"><label>Tipo</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="calle">🚶 Equipo que va a la calle</option>
              <option value="interno">🏢 Equipo que trabaja dentro</option>
            </select>
          </div>
        </CrmModal>
      )}
    </div>
  );
}
