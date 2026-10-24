import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { auth } from "../../../config/firebaseConfig";
import { usePerms } from "../../crm/lib/permissions";
import Conversation from "../components/Conversation";
import { Presence } from "./WhatsApp";
import { waApi, chatName, initial, shortTime, useWaConfig, favoriteFunnel, tagOf, inWindow, useChats, useUnreadAlert, usePeople } from "../lib/api";
import "../../crm/crm.styles.css";
import "../whatsapp.css";

// Embudos de WhatsApp (como ManyContacts): cada embudo con sus columnas; los chats se
// arrastran de una columna a otra y al pulsar uno se abre la conversación en un panel.
// Menú de cada columna: mover / archivar los asignados a mí o todos, y vaciar la columna.
export default function Funnels() {
  const [params, setParams] = useSearchParams();
  const cfg = useWaConfig();
  const perms = usePerms();
  const { chats, error } = useChats();
  useUnreadAlert(chats);
  const people = usePeople();
  const me = (auth.currentUser?.email || "").toLowerCase();
  const [who, setWho] = useState("all");
  const [term, setTerm] = useState("");
  const [over, setOver] = useState("");
  const [drag, setDrag] = useState("");
  const [menu, setMenu] = useState("");
  const [msg, setMsg] = useState("");
  const openId = params.get("chat") || "";

  const funnel = cfg ? cfg.funnels.find((f) => f.id === params.get("f")) || favoriteFunnel(cfg) : null;
  const setParam = (k, v) => { const p = Object.fromEntries(params); if (v) p[k] = v; else delete p[k]; setParams(p, { replace: true }); };

  const inFunnel = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (chats || []).filter((c) => funnel && c.funnelId === funnel.id && !c.archived
      && (who === "all" || (who === "free" ? !c.assigneeEmail : who.startsWith("team:") ? c.teamId === who.slice(5) : c.assigneeEmail === who))
      && (!t || [chatName(c), c.phone, c.lastText].some((v) => String(v || "").toLowerCase().includes(t))));
  }, [chats, funnel, who, term]);
  const byStage = (sid) => inFunnel.filter((c) => c.stageId === sid);
  const lost = funnel ? inFunnel.filter((c) => !funnel.stages.some((s) => s.id === c.stageId)) : [];
  const open = (chats || []).find((c) => c.id === openId) || null;

  const drop = async (sid) => {
    setOver("");
    const c = (chats || []).find((x) => x.id === drag);
    setDrag("");
    if (!c || c.stageId === sid) return;
    await waApi("chat", { chatId: c.id, stage: `${funnel.id}:${sid}` }).catch((e) => setMsg(e.message));
  };
  const bulk = async (sid, action, scope, to) => {
    setMenu("");
    if (action === "clear" && !window.confirm("¿Vaciar la columna? Los chats salen del embudo (no se borran).")) return;
    if (action === "archive" && !window.confirm(`¿Archivar ${scope === "mine" ? "tus chats" : "todos los chats"} de esta columna?`)) return;
    try {
      const r = await waApi("bulk", { from: `${funnel.id}:${sid}`, action, scope, ...(to ? { to: `${funnel.id}:${to}` } : {}) });
      setMsg(`${r.count} chat${r.count === 1 ? "" : "s"} ${action === "move" ? "movidos" : action === "archive" ? "archivados" : "sacados del embudo"}.`);
    } catch (e) { setMsg(e.message); }
  };
  const star = (e, c) => { e.stopPropagation(); waApi("chat", { chatId: c.id, starred: !c.starred }).catch((er) => setMsg(er.message)); };

  if (!cfg) return <div className="crm wa"><p>Cargando…</p></div>;

  const column = (s, extra) => {
    const list = extra || byStage(s.id);
    return (
      <div key={s.id} className={`wa-col ${over === s.id ? "over" : ""}`}
        onDragOver={(e) => { if (!extra) { e.preventDefault(); setOver(s.id); } }} onDragLeave={() => setOver((o) => (o === s.id ? "" : o))} onDrop={() => !extra && drop(s.id)}>
        <div className="wa-col__head">
          <b title={s.name}>{s.name}</b>
          <span className="wa-col__n">{list.length}</span>
          {!extra && <button className="wa-icon" onClick={() => setMenu((m) => (m === s.id ? "" : s.id))} title="Acciones de columna">⋮</button>}
          {menu === s.id && (
            <div className="wa-colmenu" onMouseLeave={() => setMenu("")}>
              <small>Mover asignados a mí a…</small>
              {funnel.stages.filter((x) => x.id !== s.id).map((x) => <button key={`m${x.id}`} onClick={() => bulk(s.id, "move", "mine", x.id)}>→ {x.name}</button>)}
              <small>Mover todos a…</small>
              {funnel.stages.filter((x) => x.id !== s.id).map((x) => <button key={`a${x.id}`} onClick={() => bulk(s.id, "move", "all", x.id)}>→ {x.name}</button>)}
              <hr />
              <button onClick={() => bulk(s.id, "archive", "mine")}>🗄️ Archivar asignados a mí</button>
              <button onClick={() => bulk(s.id, "archive", "all")}>🗄️ Archivar todas las conversaciones</button>
              {perms.isAdmin && <button className="danger" onClick={() => bulk(s.id, "clear", "all")}>🧹 Vaciar columna</button>}
            </div>
          )}
        </div>
        <div className="wa-col__body">
          {list.map((c) => (
            <div key={c.id} className={`wa-kcard ${c.id === openId ? "on" : ""} ${drag === c.id ? "dragging" : ""}`} draggable onDragStart={() => setDrag(c.id)} onDragEnd={() => setDrag("")} onClick={() => setParam("chat", c.id)}>
              <div className="wa-kcard__top">
                <span className="wa-avatar sm">{initial(c)}{inWindow(c) && <i className="wa-online" />}</span>
                <b>{chatName(c)}</b>
                <small className={c.unread ? "new" : ""}>{shortTime(c.lastAt)}</small>
              </div>
              <div className="wa-kcard__text">{c.lastDir === "out" ? "Tú: " : ""}{c.lastText}</div>
              <div className="wa-kcard__meta">
                {c.assigneeName ? <span className="wa-tag">👤 {c.assigneeName.split(" ")[0]}</span> : <span className="wa-tag">Sin asignar</span>}
                {(c.tags || []).map((id) => { const t = tagOf(cfg, id); return t ? <span key={id} className="wa-tag" style={{ background: t.color, color: "#fff" }}>{t.name}</span> : null; })}
                <span style={{ flex: 1 }} />
                {c.unread > 0 && <span className="wa-badge">{c.unread}</span>}
                <button className={`wa-star ${c.starred ? "on" : ""}`} onClick={(e) => star(e, c)} title="Destacar">{c.starred ? "★" : "☆"}</button>
              </div>
            </div>
          ))}
          {!list.length && <p className="wa-col__empty">{extra ? "" : "Arrastra aquí un chat"}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="crm wa">
      <div className="wa-board__bar">
        <select className="wa-select wa-select--funnel" value={funnel.id} onChange={(e) => setParam("f", e.target.value)}>
          {cfg.funnels.map((f) => <option key={f.id} value={f.id}>{f.id === cfg.favoriteFunnelId ? "★ " : ""}{f.name}</option>)}
        </select>
        <select className="wa-select" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Todas las conversaciones</option>
          <option value="free">Sin asignar</option>
          <option value={me}>Mis chats</option>
          {people.filter((p) => p.email !== me).map((p) => <option key={p.email} value={p.email}>👤 {p.name}</option>)}
          {cfg.teams.map((t) => <option key={t.id} value={`team:${t.id}`}>👥 {t.name}</option>)}
        </select>
        <input className="crm-search" style={{ margin: 0, maxWidth: 240 }} placeholder="Buscar…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <Presence cfg={cfg} />
        <span style={{ flex: 1 }} />
        <Link className="crm-btn ghost sm" to="/dashboard/whatsapp/ajustes?tab=funnels">✎ Editar embudos</Link>
      </div>
      {msg && <div className="wa-flash" onClick={() => setMsg("")}>{msg} ✕</div>}
      {error && <p className="wa-err">{error}</p>}
      <div className="wa-board">
        {funnel.stages.map((s) => column(s))}
        {lost.length > 0 && column({ id: "_lost", name: "Columna borrada" }, lost)}
      </div>
      {open && (
        <div className="wa-drawer__overlay" onClick={() => setParam("chat", "")}>
          <div className="wa-drawer" onClick={(e) => e.stopPropagation()}>
            <Conversation key={open.id} chat={open} cfg={cfg} onClose={() => setParam("chat", "")} />
          </div>
        </div>
      )}
    </div>
  );
}
