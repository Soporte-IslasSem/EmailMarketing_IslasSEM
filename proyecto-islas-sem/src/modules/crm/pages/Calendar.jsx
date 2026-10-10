import { useMemo, useState } from "react";
import TaskModal from "../components/TaskModal";
import { useCrmCollection, crmUpdate } from "../lib/crm";
import { useTaskScope, useGoogleStatus, todayYMD, byWhen, assigneeKey, assigneeLabel } from "../lib/tasks";
import "../crm.styles.css";
import "./calendar.styles.css";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
// Un color por persona/equipo (siempre el mismo para la misma clave).
const PALETTE = ["#1a9190", "#2f80ed", "#e08a2b", "#8b5cf6", "#d94f70", "#1faa59", "#b5386b", "#5b8def", "#9b59b6", "#c9445a"];
function colorFor(key) {
  if (!key) return "#8a9a9a";
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function Calendar() {
  const { items, orgId } = useCrmCollection("activities");
  const scope = useTaskScope();
  const [google] = useGoogleStatus();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  // Administrador: "" = todo el equipo; si no, "person:id" / "team:id" / "__none".
  // Resto: "" = lo suyo (sus tareas y las de sus equipos).
  const [who, setWho] = useState("");
  const [editing, setEditing] = useState(null); // tarea | { dueDate } (nueva)

  const visible = useMemo(() => {
    let r = items.filter(scope.canSee);
    if (who === "__none") r = r.filter((a) => !a.assigneeType && !a.assignee);
    else if (who) r = r.filter((a) => assigneeKey(a) === who);
    return r;
  }, [items, scope, who]);

  const byDay = useMemo(() => {
    const map = {};
    visible.forEach((a) => { if (a.dueDate) (map[a.dueDate] || (map[a.dueDate] = [])).push(a); });
    Object.values(map).forEach((list) => list.sort(byWhen));
    return map;
  }, [visible]);

  // Leyenda: personas/equipos con tareas este mes.
  const monthKey = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`;
  const legend = useMemo(() => {
    const m = new Map();
    visible.filter((a) => (a.dueDate || "").startsWith(monthKey)).forEach((a) => m.set(assigneeKey(a) || "__none", assigneeKey(a) ? assigneeLabel(a) : "Sin asignar"));
    return [...m.entries()];
  }, [visible, monthKey]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    let start = first.getDay() - 1; // lunes = 0
    if (start < 0) start = 6;
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < start; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const todayStr = todayYMD();
  const ymd = (d) => `${monthKey}-${String(d).padStart(2, "0")}`;
  const move = (delta) => setCursor((c) => { const m = c.m + delta; return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; });
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); };
  const whoOptions = scope.isAdmin
    ? scope.options
    : scope.options.filter((o) => (o.type === "team" ? scope.myTeams.some((t) => t.id === o.id) : o.id === scope.me?.id));

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Tareas · Calendario</h1>
          <p>{scope.isAdmin ? "Calendario de todo el equipo: elige una persona o equipo para ver solo el suyo." : "Tus tareas y citas, y las de tus equipos."} Pulsa un día para crear una tarea.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {whoOptions.length > 0 && (
            <select className="crm-search" style={{ margin: 0, maxWidth: 230 }} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">{scope.isAdmin ? "Todo el equipo" : "Todo lo mío"}</option>
              {scope.isAdmin && <option value="__none">— Sin asignar —</option>}
              {whoOptions.map((o) => <option key={o.key} value={o.key}>{o.type === "team" ? "👥 " : ""}{o.name}</option>)}
            </select>
          )}
          <button className="crm-btn ghost sm" onClick={goToday}>Hoy</button>
          <button className="crm-btn ghost sm" onClick={() => move(-1)}>◀</button>
          <b style={{ minWidth: 150, textAlign: "center" }}>{MONTHS[cursor.m]} {cursor.y}</b>
          <button className="crm-btn ghost sm" onClick={() => move(1)}>▶</button>
        </div>
      </div>

      {legend.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10, fontSize: 12.5 }}>
          {legend.map(([k, label]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorFor(k === "__none" ? "" : k) }} />{label}
            </span>
          ))}
        </div>
      )}

      <div className="cal-grid cal-head">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => (
          <div
            key={i}
            className={`cal-cell ${d ? "" : "empty"} ${d && ymd(d) === todayStr ? "today" : ""}`}
            style={d ? { cursor: "pointer" } : undefined}
            onClick={() => d && setEditing({ dueDate: ymd(d) })}
          >
            {d && <div className="cal-num">{d}</div>}
            {d && (byDay[ymd(d)] || []).map((a) => {
              const c = colorFor(assigneeKey(a));
              return (
                <div
                  key={a.id}
                  className={`cal-ev ${a.done ? "done" : ""}`}
                  style={a.done ? undefined : { background: `${c}1f`, color: c, borderLeft: `3px solid ${c}` }}
                  title={`${a.title}${a.assigneeType || a.assignee ? ` · ${assigneeLabel(a)}` : ""}`}
                  onClick={(e) => { e.stopPropagation(); setEditing(a); }}
                >
                  <input
                    type="checkbox"
                    checked={!!a.done}
                    title={a.done ? "Marcar como pendiente" : "Marcar como hecha"}
                    style={{ width: 11, height: 11, margin: "0 4px 0 0", verticalAlign: -1 }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => crmUpdate("activities", a.id, { done: !a.done })}
                  />
                  {a.dueTime ? `${a.dueTime} ` : ""}{a.source === "google" ? "📅 " : `${a.type}: `}{a.title}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {editing && (
        <TaskModal
          orgId={orgId}
          task={editing.id ? editing : null}
          preset={editing.id ? undefined : { dueDate: editing.dueDate }}
          scope={scope}
          google={google}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
