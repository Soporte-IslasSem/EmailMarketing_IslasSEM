// Inicio › "Tus tareas de hoy": aviso para conectar Google Calendar, agenda del día por
// horas (tareas con hora y citas de Google) y lista de vencidas / sin hora. Cada persona
// ve las suyas y las de sus equipos; el administrador también las sin asignar.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCrmCollection, crmUpdate } from "../../../crm/lib/crm";
import { useTaskScope, useGoogleStatus, googleApi, assigneeLabel, todayYMD, byWhen } from "../../../crm/lib/tasks";

const hourOf = (t) => Number(String(t || "").slice(0, 2));

export default function TodayTasks() {
  const { items, loading } = useCrmCollection("activities");
  const scope = useTaskScope();
  const [google] = useGoogleStatus();
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState("");
  const today = todayYMD();

  const { overdue, timed, untimed } = useMemo(() => {
    const mine = items.filter((a) => !a.done && a.dueDate && (scope.isMine(a) || (scope.isAdmin && !a.assigneeType && !a.assignee)));
    const todays = mine.filter((a) => a.dueDate === today).sort(byWhen);
    return {
      overdue: mine.filter((a) => a.dueDate < today).sort(byWhen),
      timed: todays.filter((a) => /^\d{2}:\d{2}$/.test(a.dueTime || "")),
      untimed: todays.filter((a) => !/^\d{2}:\d{2}$/.test(a.dueTime || "")),
    };
  }, [items, scope, today]);

  // Horas de la agenda: de 8 a 19 como mínimo, ampliando si hay citas antes o después.
  const hours = useMemo(() => {
    const hs = timed.map((a) => hourOf(a.dueTime));
    const from = Math.min(8, ...hs);
    const to = Math.max(19, ...hs);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [timed]);
  const nowH = new Date().getHours();

  const connect = async () => {
    setConnecting(true); setErr("");
    try { const { url } = await googleApi("connect", { method: "POST", body: { scope: "me" } }); window.location.href = url; }
    catch (e) { setErr(e.message); setConnecting(false); }
  };

  const Item = ({ a, late }) => (
    <div className="TodayTasks__item">
      <input type="checkbox" checked={false} onChange={() => crmUpdate("activities", a.id, { done: true })} title="Marcar como hecha" />
      {late && <span className="TodayTasks__time">{a.dueDate.slice(5).split("-").reverse().join("/")}</span>}
      {!late && a.dueTime && <span className="TodayTasks__time">{a.dueTime}{a.endTime ? `–${a.endTime}` : ""}</span>}
      <span className="TodayTasks__title">
        {a.source === "google" ? "📅 " : ""}{a.title}
        {(a.attendees || []).length > 0 && <small> · {a.attendees.map((g) => g.name || g.email).join(", ")}</small>}
      </span>
      {a.meetLink && <a className="TodayTasks__meet" href={a.meetLink} target="_blank" rel="noreferrer">Meet</a>}
      {(a.assigneeType || a.assignee) && <span className="TodayTasks__who">{assigneeLabel(a)}</span>}
    </div>
  );

  // Cada persona conecta su propio calendario (su cuenta @islassem.com).
  const showConnect = google && !google.error && google.configured && !google.me?.connected;
  const fecha = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="TodayTasks">
      <div className="TodayTasks__head">
        <h3>Tus tareas de hoy</h3>
        <Link to="/dashboard/tasks">Ver todas →</Link>
      </div>

      {showConnect && (
        <div className="TodayTasks__connect">
          <span>📅 Conecta tu Google Calendar ({google.me?.email || "@islassem.com"}) para ver aquí tus citas y recibir las tareas que te asignen.</span>
          <button onClick={connect} disabled={connecting}>{connecting ? "Abriendo Google…" : "Conectar mi calendario"}</button>
          {err && <small className="TodayTasks__err">{err}</small>}
        </div>
      )}

      {loading ? (
        <p className="TodayTasks__empty">Cargando…</p>
      ) : (
        <div className="TodayTasks__cols">
          <div className="TodayTasks__agenda">
            <div className="TodayTasks__label">📆 <span style={{ textTransform: "capitalize" }}>{fecha}</span></div>
            {hours.map((h) => {
              const at = timed.filter((a) => hourOf(a.dueTime) === h);
              return (
                <div key={h} className={`TodayTasks__hour ${h === nowH ? "now" : ""}`}>
                  <span className="TodayTasks__hh">{String(h).padStart(2, "0")}:00</span>
                  <div className="TodayTasks__slot">{at.map((a) => <Item key={a.id} a={a} />)}</div>
                </div>
              );
            })}
          </div>
          <div className="TodayTasks__side">
            {overdue.length > 0 && (
              <>
                <div className="TodayTasks__label TodayTasks__label--late">Vencidas ({overdue.length})</div>
                {overdue.slice(0, 6).map((a) => <Item key={a.id} a={a} late />)}
                {overdue.length > 6 && <Link className="TodayTasks__more" to="/dashboard/tasks">y {overdue.length - 6} más…</Link>}
              </>
            )}
            <div className="TodayTasks__label">Hoy sin hora ({untimed.length})</div>
            {untimed.length ? untimed.map((a) => <Item key={a.id} a={a} />) : <p className="TodayTasks__empty">Nada pendiente sin hora.</p>}
            {!overdue.length && !timed.length && !untimed.length && <p className="TodayTasks__empty">No tienes tareas para hoy. 🎉</p>}
          </div>
        </div>
      )}
    </div>
  );
}
