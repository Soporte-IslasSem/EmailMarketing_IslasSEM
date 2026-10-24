import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { auth } from "../../../config/firebaseConfig";
import Conversation, { NewChatModal } from "../components/Conversation";
import { chatName, initial, shortTime, useWaConfig, saveConfig, stageLabel, tagOf, inWindow, useChats, useUnreadAlert } from "../lib/api";
import "../../crm/crm.styles.css";
import "../whatsapp.css";

// Bandeja de WhatsApp: lista de chats a la izquierda y la conversación a la derecha, en tiempo
// real. Filtros como en ManyContacts (todos, no leídos, míos, sin asignar, destacados,
// archivados) + por equipo, etiqueta y embudo. Aviso sonoro al llegar mensajes.
const FILTERS = [["all", "Todos"], ["unread", "No leídos"], ["mine", "Míos"], ["free", "Sin asignar"], ["starred", "★ Destacados"], ["archived", "Archivados"]];

export function Presence({ cfg }) {
  const me = (auth.currentUser?.email || "").toLowerCase();
  const away = !!cfg?.away?.[me];
  const [busy, setBusy] = useState(false);
  return (
    <button className={`wa-presence ${away ? "away" : ""}`} disabled={busy} title="Si estás ausente, la asignación automática no te pasa chats nuevos"
      onClick={() => { setBusy(true); saveConfig("presence", { away: !away }).catch(() => {}).finally(() => setBusy(false)); }}>
      <span className="dot" />{away ? "Ausente" : "Disponible"}
    </button>
  );
}

export default function WhatsApp() {
  const [params, setParams] = useSearchParams();
  const { chats, error } = useChats();
  const cfg = useWaConfig();
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [team, setTeam] = useState("");
  const [tag, setTag] = useState("");
  const [funnel, setFunnel] = useState("");
  const [newChat, setNewChat] = useState(false);
  const me = (auth.currentUser?.email || "").toLowerCase();
  const openId = params.get("chat") || "";
  const unreadTotal = useUnreadAlert(chats);

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    const d = t.replace(/\D/g, "");
    return (chats || []).filter((c) => {
      if (filter === "archived" ? !c.archived : c.archived) return false;
      if (filter === "unread" && !c.unread) return false;
      if (filter === "mine" && c.assigneeEmail !== me) return false;
      if (filter === "free" && c.assigneeEmail) return false;
      if (filter === "starred" && !c.starred) return false;
      if (team && c.teamId !== team) return false;
      if (tag && !(c.tags || []).includes(tag)) return false;
      if (funnel && c.funnelId !== funnel) return false;
      return !t || [chatName(c), c.profileName, c.lastText, c.notes].some((v) => String(v || "").toLowerCase().includes(t)) || (d.length >= 3 && String(c.phone).includes(d));
    });
  }, [chats, term, filter, me, team, tag, funnel]);
  const open = (chats || []).find((c) => c.id === openId) || null;
  const select = (id) => setParams(id ? { chat: id } : {}, { replace: true });
  const count = (k) => (chats || []).filter((c) => !c.archived && (k === "unread" ? c.unread : k === "mine" ? c.assigneeEmail === me : k === "free" ? !c.assigneeEmail : false)).length;

  return (
    <div className="crm wa">
      <div className={`wa-shell ${open ? "is-open" : ""}`}>
        <aside className="wa-list">
          <div className="wa-list__head">
            <b>Chats</b>{unreadTotal > 0 && <span className="wa-badge">{unreadTotal}</span>}
            <Presence cfg={cfg} />
            <button className="crm-btn sm" style={{ marginLeft: "auto" }} onClick={() => setNewChat(true)} title="Iniciar una conversación con una plantilla">+ Nuevo</button>
          </div>
          <input className="crm-search wa-search" placeholder="Buscar nombre, número, mensaje o nota…" value={term} onChange={(e) => setTerm(e.target.value)} />
          <div className="wa-filters">
            {FILTERS.map(([k, l]) => {
              const n = ["unread", "mine", "free"].includes(k) ? count(k) : 0;
              return <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}{n > 0 && <i>{n}</i>}</button>;
            })}
          </div>
          {cfg && (cfg.teams.length > 0 || cfg.tags.length > 0 || cfg.funnels.length > 1) && (
            <div className="wa-subfilters">
              {cfg.teams.length > 0 && <select value={team} onChange={(e) => setTeam(e.target.value)}><option value="">Todos los equipos</option>{cfg.teams.map((t) => <option key={t.id} value={t.id}>👥 {t.name}</option>)}</select>}
              {cfg.tags.length > 0 && <select value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Todas las etiquetas</option>{cfg.tags.map((t) => <option key={t.id} value={t.id}>🏷 {t.name}</option>)}</select>}
              {cfg.funnels.length > 1 && <select value={funnel} onChange={(e) => setFunnel(e.target.value)}><option value="">Todos los embudos</option>{cfg.funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
            </div>
          )}
          <div className="wa-list__items">
            {error ? <p className="wa-empty">{error}</p>
              : chats === null ? <p className="wa-empty">Cargando…</p>
              : !shown.length ? <p className="wa-empty">{chats.length ? "Ningún chat con este filtro." : <>Aún no hay chats. Aparecerán aquí en cuanto alguien escriba al número conectado, o empieza tú con <b>+ Nuevo</b>.</>}</p>
              : shown.map((c) => <ChatItem key={c.id} c={c} cfg={cfg} on={c.id === openId} onClick={() => select(c.id)} />)}
          </div>
        </aside>
        {open && cfg ? <Conversation key={open.id} chat={open} cfg={cfg} onBack={() => select("")} />
          : <section className="wa-conv wa-conv--empty"><div><div style={{ fontSize: 42 }}>💬</div><p>Elige un chat de la lista.</p><p className="wa-hint"><Link to="/dashboard/whatsapp/embudos">Ver los chats por embudo →</Link></p></div></section>}
      </div>
      {newChat && <NewChatModal onClose={() => setNewChat(false)} onStarted={(id) => { setNewChat(false); select(id); }} />}
    </div>
  );
}

export function ChatItem({ c, cfg, on, onClick }) {
  return (
    <button className={`wa-item ${on ? "on" : ""}`} onClick={onClick}>
      <span className="wa-avatar">{initial(c)}{inWindow(c) && <i className="wa-online" title="Ventana de 24 h abierta" />}</span>
      <span className="wa-item__body">
        <span className="wa-item__top"><b>{c.starred ? "★ " : ""}{chatName(c)}</b><small className={c.unread ? "new" : ""}>{shortTime(c.lastAt)}</small></span>
        <span className="wa-item__bottom">
          <span className="wa-item__text">{c.lastDir === "out" ? "Tú: " : ""}{c.lastText}</span>
          {c.unread > 0 && <span className="wa-badge">{c.unread}</span>}
        </span>
        <span className="wa-item__meta">
          {!c.contactId && <span className="wa-tag">Sin ligar</span>}
          {c.assigneeName && <span className="wa-tag">👤 {c.assigneeName.split(" ")[0]}</span>}
          {cfg && stageLabel(cfg, c) && <span className="wa-tag ok">{stageLabel(cfg, c).split(" › ")[1]}</span>}
          {(c.tags || []).map((id) => { const t = tagOf(cfg, id); return t ? <span key={id} className="wa-tag" style={{ background: t.color, color: "#fff" }}>{t.name}</span> : null; })}
          {c.blocked && <span className="wa-tag bad">Bloqueado</span>}
        </span>
      </span>
    </button>
  );
}

