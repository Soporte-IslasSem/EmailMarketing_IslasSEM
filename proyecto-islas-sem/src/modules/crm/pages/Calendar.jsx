import { useMemo, useState } from "react";
import { useCrmCollection } from "../lib/crm";
import { useTaskScope, todayYMD, byWhen } from "../lib/tasks";
import "../crm.styles.css";
import "./calendar.styles.css";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function Calendar() {
  const { items } = useCrmCollection("activities");
  const scope = useTaskScope();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const byDay = useMemo(() => {
    const map = {};
    items.filter(scope.canSee).forEach((a) => { if (a.dueDate) (map[a.dueDate] || (map[a.dueDate] = [])).push(a); });
    Object.values(map).forEach((list) => list.sort(byWhen));
    return map;
  }, [items, scope]);

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
  const ymd = (d) => `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const move = (delta) => setCursor((c) => { const m = c.m + delta; return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; });

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Tareas · Calendario</h1>
          <p>Reuniones, llamadas, tareas y seguimientos por día.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="crm-btn ghost sm" onClick={() => move(-1)}>◀</button>
          <b style={{ minWidth: 160, textAlign: "center" }}>{MONTHS[cursor.m]} {cursor.y}</b>
          <button className="crm-btn ghost sm" onClick={() => move(1)}>▶</button>
        </div>
      </div>

      <div className="cal-grid cal-head">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => (
          <div key={i} className={`cal-cell ${d ? "" : "empty"} ${d && ymd(d) === todayStr ? "today" : ""}`}>
            {d && <div className="cal-num">{d}</div>}
            {d && (byDay[ymd(d)] || []).map((a) => (
              <div key={a.id} className={`cal-ev ${a.done ? "done" : ""} ${a.source === "google" ? "google" : ""}`} title={`${a.title}${a.assigneeName ? ` · ${a.assigneeName}` : ""}`}>
                {a.dueTime ? `${a.dueTime} ` : ""}{a.source === "google" ? "📅 " : `${a.type}: `}{a.title}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
