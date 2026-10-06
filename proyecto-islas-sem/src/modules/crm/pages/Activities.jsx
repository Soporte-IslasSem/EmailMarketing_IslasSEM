import { useMemo, useState } from "react";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove, fmtDate, ACTIVITY_TYPES } from "../lib/crm";
import "../crm.styles.css";

const empty = { type: "Tarea", title: "", dueDate: "", priority: "Media", done: false };

export default function Activities() {
  const { items, loading, orgId } = useCrmCollection("activities");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("pendientes");

  const rows = useMemo(() => {
    let r = [...items].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (filter === "pendientes") r = r.filter((a) => !a.done);
    if (filter === "hechas") r = r.filter((a) => a.done);
    return r;
  }, [items, filter]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await crmCreate("activities", orgId, { ...form, entity: null, entityId: null });
      setForm(empty);
      setShowNew(false);
    } catch (e) {
      alert("No se pudo crear: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Actividades</h1>
          <p>Tareas, llamadas, reuniones y seguimientos del equipo.</p>
        </div>
        <button className="crm-btn" onClick={() => setShowNew(true)}>
          + Nueva actividad
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[
          ["pendientes", "Pendientes"],
          ["hechas", "Hechas"],
          ["todas", "Todas"],
        ].map(([k, l]) => (
          <button key={k} className={`crm-btn ${filter === k ? "" : "ghost"} sm`} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="crm-loading">Cargando actividades…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr>
              <th></th>
              <th>Tipo</th>
              <th>Título</th>
              <th>Vencimiento</th>
              <th>Prioridad</th>
              <th>Creada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((a) => (
                <tr key={a.id} style={a.done ? { opacity: 0.55 } : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!a.done}
                      onChange={() => crmUpdate("activities", a.id, { done: !a.done })}
                    />
                  </td>
                  <td><span className="crm-chip">{a.type}</span></td>
                  <td style={a.done ? { textDecoration: "line-through" } : undefined}>{a.title}</td>
                  <td>{a.dueDate || "—"}</td>
                  <td>{a.priority || "—"}</td>
                  <td>{fmtDate(a.createdAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="crm-btn ghost sm"
                      onClick={() => window.confirm("¿Eliminar actividad?") && crmRemove("activities", a.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="crm-empty">Sin actividades en esta vista.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && (
        <CrmModal
          title="Nueva actividad"
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear"}</button>
            </>
          }
        >
          <div className="crm-two">
            <div className="crm-field">
              <label>Tipo</label>
              <select value={form.type} onChange={set("type")}>
                {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="crm-field">
              <label>Prioridad</label>
              <select value={form.priority} onChange={set("priority")}>
                <option>Alta</option>
                <option>Media</option>
                <option>Baja</option>
              </select>
            </div>
          </div>
          <div className="crm-field">
            <label>Título</label>
            <input value={form.title} onChange={set("title")} autoFocus />
          </div>
          <div className="crm-field">
            <label>Vencimiento</label>
            <input type="date" value={form.dueDate} onChange={set("dueDate")} />
          </div>
        </CrmModal>
      )}
    </div>
  );
}
