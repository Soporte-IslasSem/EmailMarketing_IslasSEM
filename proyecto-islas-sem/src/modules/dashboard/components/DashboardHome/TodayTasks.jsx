// Inicio › "Tus tareas de hoy": vencidas + las de hoy (incluidas las citas de Google
// Calendar), según lo que ve cada persona (las suyas y las de sus equipos; todas si es
// administrador).
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCrmCollection, crmUpdate } from "../../../crm/lib/crm";
import { useTaskScope, assigneeLabel, todayYMD, byWhen } from "../../../crm/lib/tasks";

export default function TodayTasks() {
  const { items, loading } = useCrmCollection("activities");
  const scope = useTaskScope();
  const today = todayYMD();

  const { overdue, todays } = useMemo(() => {
    // En el Inicio el administrador ve las suyas + las sin asignar; el resto, las suyas.
    const mine = items.filter((a) => !a.done && a.dueDate && (scope.isMine(a) || (scope.isAdmin && !a.assigneeType && !a.assignee)));
    return {
      overdue: mine.filter((a) => a.dueDate < today).sort(byWhen),
      todays: mine.filter((a) => a.dueDate === today).sort(byWhen),
    };
  }, [items, scope, today]);

  const row = (a, late) => (
    <li key={a.id} className="TodayTasks__item">
      <input type="checkbox" checked={false} onChange={() => crmUpdate("activities", a.id, { done: true })} title="Marcar como hecha" />
      <span className="TodayTasks__time">{late ? a.dueDate.slice(5).split("-").reverse().join("/") : a.dueTime || "Hoy"}</span>
      <span className="TodayTasks__title">
        {a.source === "google" ? "📅 " : ""}{a.title}
        {(a.attendees || []).length > 0 && <small> · {a.attendees.map((g) => g.name || g.email).join(", ")}</small>}
      </span>
      {a.meetLink && <a className="TodayTasks__meet" href={a.meetLink} target="_blank" rel="noreferrer">Meet</a>}
      {(a.assigneeType || a.assignee) && <span className="TodayTasks__who">{assigneeLabel(a)}</span>}
    </li>
  );

  return (
    <div className="TodayTasks">
      <div className="TodayTasks__head">
        <h3>Tus tareas de hoy</h3>
        <Link to="/dashboard/tasks">Ver todas →</Link>
      </div>
      {loading ? (
        <p className="TodayTasks__empty">Cargando…</p>
      ) : !overdue.length && !todays.length ? (
        <p className="TodayTasks__empty">No tienes tareas para hoy. 🎉</p>
      ) : (
        <>
          {overdue.length > 0 && (
            <>
              <div className="TodayTasks__label TodayTasks__label--late">Vencidas ({overdue.length})</div>
              <ul>{overdue.slice(0, 5).map((a) => row(a, true))}</ul>
              {overdue.length > 5 && <Link className="TodayTasks__more" to="/dashboard/tasks">y {overdue.length - 5} más…</Link>}
            </>
          )}
          {todays.length > 0 && (
            <>
              <div className="TodayTasks__label">Hoy ({todays.length})</div>
              <ul>{todays.map((a) => row(a, false))}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
