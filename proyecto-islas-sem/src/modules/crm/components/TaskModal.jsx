// Crear / editar una tarea: tipo, prioridad, fecha y hora, asignación a persona o equipo
// y publicarla como cita en Google Calendar (el de la persona asignada si lo conectó, si no
// el de la empresa). `preset` abre una tarea nueva ya enlazada (p. ej. a una negociación):
// { type, title, entity, entityId, contactId, link }.
import { useState } from "react";
import CrmModal from "./CrmModal";
import { crmCreate, crmUpdate, ACTIVITY_TYPES } from "../lib/crm";
import { assigneeFields, assigneeKey, googleApi, todayYMD } from "../lib/tasks";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function TaskModal({ orgId, task, scope, google, onClose, preset }) {
  const editing = !!task?.id;
  const fromGoogle = task?.source === "google";
  const [f, setF] = useState(() => ({
    type: task?.type || preset?.type || "Tarea",
    priority: task?.priority || "Media",
    title: task?.title || preset?.title || "",
    body: task?.body || "",
    dueDate: task?.dueDate || preset?.dueDate || todayYMD(),
    dueTime: task?.dueTime || "",
    endTime: task?.endTime || "",
    assignee: task ? assigneeKey(task) : (scope.isAdmin ? "" : scope.assignOptions[0]?.key || ""),
    toGoogle: !!task?.googleEventId,
    done: !!task?.done,
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  // Un no-administrador puede reasignar solo a sí mismo; si la tarea ya tenía otra
  // asignación, se conserva como opción para no perderla al guardar.
  const opts = [...scope.assignOptions];
  const currentKey = task ? assigneeKey(task) : "";
  if (currentKey && !opts.some((o) => o.key === currentKey)) {
    opts.unshift({ key: currentKey, type: task.assigneeType, id: task.assigneeId, name: task.assigneeName, email: task.assigneeEmail });
  }

  const save = async () => {
    setError("");
    if (!f.title.trim()) return setError("Escribe un título.");
    if (f.dueTime && !HHMM.test(f.dueTime)) return setError("Hora no válida.");
    if (f.endTime && (!f.dueTime || f.endTime <= f.dueTime)) return setError("La hora de fin debe ser posterior a la de inicio.");
    if (f.toGoogle && (!f.dueDate || !f.dueTime)) return setError("Para añadirla a Google Calendar necesita fecha y hora.");
    const opt = opts.find((o) => o.key === f.assignee) || null;
    const data = {
      type: f.type, priority: f.priority, title: f.title.trim(), body: f.body.trim(),
      dueDate: f.dueDate, dueTime: f.dueTime, endTime: f.endTime,
      ...assigneeFields(opt),
      ...(editing ? { done: f.done } : {}),
    };
    setSaving(true);
    try {
      let id = task?.id;
      if (editing) await crmUpdate("activities", id, data);
      else {
        const ref = await crmCreate("activities", orgId, {
          ...data, done: false, createdByEmail: scope.email,
          entity: preset?.entity || null, entityId: preset?.entityId || null, contactId: preset?.contactId || "",
        });
        id = ref.id;
      }
      // Publicar o actualizar la cita en Google si se pidió (o si ya estaba enlazada).
      const linked = f.toGoogle || (editing && task.googleEventId);
      const anyCalendar = google?.connected || google?.me?.connected || (google?.people || []).length > 0;
      if (linked && f.dueDate && f.dueTime && anyCalendar) {
        try { await googleApi("events", { method: "POST", body: { activityId: id } }); }
        catch (e) { alert(`La tarea se guardó, pero no se pudo actualizar Google Calendar: ${e.message}`); }
      }
      onClose();
    } catch (e) {
      setError("No se pudo guardar: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrmModal
      title={editing ? "Editar tarea" : "Nueva tarea"}
      onClose={onClose}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar" : "Crear"}</button>
        </>
      }
    >
      {preset?.link && <p style={{ fontSize: 13, margin: "0 0 10px" }}>Enlazada a: <b>{preset.link}</b></p>}
      {fromGoogle && (
        <p style={{ fontSize: 12.5, background: "#eef6ff", color: "#1d4f91", padding: "8px 10px", borderRadius: 8, margin: "0 0 10px" }}>
          📅 Cita de Google Calendar. Los cambios de fecha u hora se hacen en Google y llegan solos aquí; desde la app
          puedes asignarla, cambiar la prioridad o marcarla como hecha.
        </p>
      )}
      <div className="crm-two">
        <div className="crm-field">
          <label>Tipo</label>
          <select value={f.type} onChange={set("type")} disabled={fromGoogle}>
            {[...new Set([...ACTIVITY_TYPES, f.type])].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="crm-field">
          <label>Prioridad</label>
          <select value={f.priority} onChange={set("priority")}>
            <option>Alta</option><option>Media</option><option>Baja</option>
          </select>
        </div>
      </div>
      <div className="crm-field"><label>Título</label><input value={f.title} onChange={set("title")} autoFocus={!editing} disabled={fromGoogle} /></div>
      <div className="crm-two">
        <div className="crm-field"><label>Fecha</label><input type="date" value={f.dueDate} onChange={set("dueDate")} disabled={fromGoogle} /></div>
        <div className="crm-two">
          <div className="crm-field"><label>Hora</label><input type="time" value={f.dueTime} onChange={set("dueTime")} disabled={fromGoogle} /></div>
          <div className="crm-field"><label>Hasta</label><input type="time" value={f.endTime} onChange={set("endTime")} disabled={fromGoogle} /></div>
        </div>
      </div>
      <div className="crm-field">
        <label>Asignar a</label>
        <select value={f.assignee} onChange={set("assignee")}>
          {scope.isAdmin && <option value="">— Sin asignar (la ven los administradores) —</option>}
          {opts.filter((o) => o.type === "person").length > 0 && (
            <optgroup label="Personas">
              {opts.filter((o) => o.type === "person").map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
            </optgroup>
          )}
          {opts.filter((o) => o.type === "team").length > 0 && (
            <optgroup label="Equipos">
              {opts.filter((o) => o.type === "team").map((o) => <option key={o.key} value={o.key}>👥 {o.name}</option>)}
            </optgroup>
          )}
        </select>
        {!scope.people.length && (
          <small style={{ color: "var(--crm-muted)" }}>Para asignar a personas, dalas de alta en CRM › Empleados (con su email de acceso).</small>
        )}
      </div>
      <div className="crm-field"><label>Notas</label><textarea rows={3} value={f.body} onChange={set("body")} /></div>
      {!fromGoogle && (google?.connected || google?.me?.connected || (google?.people || []).length > 0) && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
          <input type="checkbox" checked={f.toGoogle} onChange={set("toGoogle")} disabled={editing && !!task.googleEventId} />
          📅 {editing && task.googleEventId ? "Enlazada con Google Calendar (los cambios se actualizan allí)" : "Añadir a Google Calendar (el de la persona asignada, o el de la empresa)"}
        </label>
      )}
      {editing && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer", marginTop: 8 }}>
          <input type="checkbox" checked={f.done} onChange={set("done")} /> ✅ Tarea hecha
        </label>
      )}
      {error && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginTop: 12 }}>{error}</div>}
    </CrmModal>
  );
}
