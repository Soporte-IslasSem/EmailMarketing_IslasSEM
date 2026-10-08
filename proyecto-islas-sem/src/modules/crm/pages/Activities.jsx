import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import TaskModal from "../components/TaskModal";
import GoogleCalendarPanel from "../components/GoogleCalendarPanel";
import { useCrmCollection, crmUpdate, crmRemove, fmtDate } from "../lib/crm";
import { useTaskScope, useGoogleStatus, assigneeLabel, todayYMD, byWhen } from "../lib/tasks";
import "../crm.styles.css";

const WHEN = [
  ["pendientes", "Pendientes"],
  ["hoy", "Hoy"],
  ["vencidas", "Vencidas"],
  ["proximas", "Próximas"],
  ["hechas", "Hechas"],
  ["todas", "Todas"],
];

export default function Activities() {
  const { items, loading, orgId } = useCrmCollection("activities");
  const scope = useTaskScope();
  const [google, refreshGoogle] = useGoogleStatus();
  const [params] = useSearchParams();
  const [who, setWho] = useState(null); // "mias" | "todas" (por defecto según el rol)
  const [when, setWhen] = useState("pendientes");
  const [editing, setEditing] = useState(null); // null | {} (nueva) | tarea

  const view = who || (scope.isAdmin ? "todas" : "mias");
  const today = todayYMD();

  const rows = useMemo(() => {
    let r = items.filter(scope.canSee);
    if (view === "mias") r = r.filter(scope.isMine);
    if (when === "pendientes") r = r.filter((a) => !a.done);
    if (when === "hoy") r = r.filter((a) => !a.done && a.dueDate === today);
    if (when === "vencidas") r = r.filter((a) => !a.done && a.dueDate && a.dueDate < today);
    if (when === "proximas") r = r.filter((a) => !a.done && a.dueDate && a.dueDate > today);
    if (when === "hechas") r = r.filter((a) => a.done);
    // Con fecha primero (por fecha y hora); sin fecha al final, las más recientes antes.
    return r.sort((a, b) => (a.dueDate && b.dueDate ? byWhen(a, b) : a.dueDate ? -1 : b.dueDate ? 1 : (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  }, [items, scope, view, when, today]);

  const remove = (a) =>
    window.confirm(a.googleEventId ? "¿Eliminar la tarea? La cita seguirá en Google Calendar: si ya no hace falta, bórrala también allí." : "¿Eliminar la tarea?") &&
    crmRemove("activities", a.id);

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Tareas</h1>
          <p>
            {scope.isAdmin
              ? "Tareas, llamadas, reuniones y citas del equipo. Como administrador ves todas y puedes repartirlas."
              : "Tus tareas y las de tus equipos."}
          </p>
        </div>
        <button className="crm-btn" onClick={() => setEditing({})}>+ Nueva tarea</button>
      </div>

      <GoogleCalendarPanel status={google} refresh={refreshGoogle} options={scope.options} result={params.get("google")} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
        {scope.isAdmin && (
          <>
            {[["todas", "Todo el equipo"], ["mias", "Mis tareas"]].map(([k, l]) => (
              <button key={k} className={`crm-btn ${view === k ? "" : "ghost"} sm`} onClick={() => setWho(k)}>{l}</button>
            ))}
            <span style={{ width: 1, height: 22, background: "#dfe7e7", margin: "0 4px" }} />
          </>
        )}
        {WHEN.map(([k, l]) => (
          <button key={k} className={`crm-btn ${when === k ? "" : "ghost"} sm`} onClick={() => setWhen(k)}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="crm-loading">Cargando tareas…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr>
              <th></th>
              <th>Tipo</th>
              <th>Título</th>
              <th>Cuándo</th>
              <th>Asignada a</th>
              <th>Prioridad</th>
              <th>Creada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((a) => {
                const late = !a.done && a.dueDate && a.dueDate < today;
                return (
                  <tr key={a.id} style={a.done ? { opacity: 0.55 } : undefined}>
                    <td>
                      <input type="checkbox" checked={!!a.done} onChange={() => crmUpdate("activities", a.id, { done: !a.done })} />
                    </td>
                    <td><span className="crm-chip">{a.source === "google" ? "📅 " : ""}{a.type}</span></td>
                    <td style={a.done ? { textDecoration: "line-through" } : undefined}>
                      {a.title}
                      {(a.attendees || []).length > 0 && (
                        <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>Con: {a.attendees.map((g) => g.name || g.email).join(", ")}</div>
                      )}
                      {(a.meetLink || a.googleLink) && (
                        <div style={{ fontSize: 12, display: "flex", gap: 10 }}>
                          {a.meetLink && <a href={a.meetLink} target="_blank" rel="noreferrer">Unirse a Meet</a>}
                          {a.googleLink && <a href={a.googleLink} target="_blank" rel="noreferrer">Ver en Google Calendar</a>}
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap", color: late ? "#b0304c" : undefined }}>
                      {a.dueDate ? `${a.dueDate === today ? "Hoy" : a.dueDate}${a.dueTime ? ` · ${a.dueTime}${a.endTime ? `–${a.endTime}` : ""}` : ""}` : "—"}
                      {late && <div style={{ fontSize: 11.5 }}>Vencida</div>}
                    </td>
                    <td>{assigneeLabel(a)}</td>
                    <td>{a.priority || "—"}</td>
                    <td>{fmtDate(a.createdAt)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="crm-btn ghost sm" onClick={() => setEditing(a)}>Editar</button>{" "}
                      {a.source !== "google" && <button className="crm-btn ghost sm" onClick={() => remove(a)}>Eliminar</button>}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="crm-empty">Sin tareas en esta vista.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {editing && (
        <TaskModal
          orgId={orgId}
          task={editing.id ? editing : null}
          scope={scope}
          google={google}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
