import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import CrmModal from "../../crm/components/CrmModal";
import { useCrmCollection } from "../../crm/lib/crm";
import { usePerms } from "../../crm/lib/permissions";
import { toBase64 } from "../../contracts/lib/api";
import { waApi, inWindow, chatName, shortTime, dayLabel, hourLabel, STATUS_ICON } from "../lib/api";
import "../../crm/crm.styles.css";
import "../whatsapp.css";

// Bandeja de WhatsApp: lista de chats a la izquierda y la conversación a la derecha,
// en tiempo real. Cada chat es un número; si coincide con un contacto del CRM, queda ligado.
const FILTERS = [["all", "Todos"], ["unread", "No leídos"], ["mine", "Míos"], ["free", "Sin asignar"], ["archived", "Archivados"]];

export default function WhatsApp() {
  const [params, setParams] = useSearchParams();
  const [chats, setChats] = useState(null);
  const [error, setError] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const me = (auth.currentUser?.email || "").toLowerCase();
  const openId = params.get("chat") || "";

  useEffect(() => onSnapshot(
    query(collection(db, "waChats"), orderBy("lastAt", "desc"), limit(500)),
    (s) => { setChats(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setError(""); },
    (e) => { setChats([]); setError(e.code === "permission-denied" ? "No tienes permiso para ver los chats." : e.message); },
  ), []);

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (chats || []).filter((c) => {
      if (filter === "archived" ? !c.archived : c.archived) return false;
      if (filter === "unread" && !c.unread) return false;
      if (filter === "mine" && c.assigneeEmail !== me) return false;
      if (filter === "free" && c.assigneeEmail) return false;
      return !t || [chatName(c), c.phone, c.profileName, c.lastText].some((v) => String(v || "").toLowerCase().includes(t));
    });
  }, [chats, term, filter, me]);
  const unreadTotal = (chats || []).filter((c) => c.unread && !c.archived).length;
  const open = (chats || []).find((c) => c.id === openId) || null;
  const select = (id) => setParams(id ? { chat: id } : {}, { replace: true });

  return (
    <div className="crm wa">
      <div className="wa-shell">
        <aside className={`wa-list ${open ? "has-open" : ""}`}>
          <div className="wa-list__head">
            <b>Chats</b>{unreadTotal > 0 && <span className="wa-badge">{unreadTotal}</span>}
            <Link to="/dashboard/whatsapp/ajustes" className="wa-link" style={{ marginLeft: "auto" }}>Ajustes</Link>
          </div>
          <input className="crm-search wa-search" placeholder="Buscar nombre, número o mensaje…" value={term} onChange={(e) => setTerm(e.target.value)} />
          <div className="wa-filters">
            {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <div className="wa-list__items">
            {error ? <p className="wa-empty">{error}</p>
              : chats === null ? <p className="wa-empty">Cargando…</p>
              : !shown.length ? <p className="wa-empty">{chats.length ? "Ningún chat con este filtro." : "Aún no hay chats. Aparecerán aquí en cuanto alguien escriba al número de WhatsApp conectado."}</p>
              : shown.map((c) => (
                <button key={c.id} className={`wa-item ${c.id === openId ? "on" : ""}`} onClick={() => select(c.id)}>
                  <span className="wa-avatar">{(chatName(c).replace(/^\+/, "")[0] || "?").toUpperCase()}</span>
                  <span className="wa-item__body">
                    <span className="wa-item__top"><b>{chatName(c)}</b><small className={c.unread ? "new" : ""}>{shortTime(c.lastAt)}</small></span>
                    <span className="wa-item__bottom">
                      <span className="wa-item__text">{c.lastDir === "out" ? "Tú: " : ""}{c.lastText}</span>
                      {c.unread > 0 && <span className="wa-badge">{c.unread}</span>}
                    </span>
                    <span className="wa-item__meta">
                      {c.contactId ? <span className="wa-tag ok">Contacto CRM</span> : <span className="wa-tag">Sin ligar</span>}
                      {c.assigneeName && <span className="wa-tag">👤 {c.assigneeName}</span>}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </aside>
        {open ? <Conversation key={open.id} chat={open} onBack={() => select("")} />
          : <section className="wa-conv wa-conv--empty"><div><div style={{ fontSize: 42 }}>💬</div><p>Elige un chat de la lista.</p></div></section>}
      </div>
    </div>
  );
}

function Conversation({ chat, onBack }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);
  const [linking, setLinking] = useState(false);
  const bottom = useRef(null);
  const fileInput = useRef(null);
  const open = inWindow(chat);

  useEffect(() => onSnapshot(
    query(collection(db, "waChats", chat.id, "messages"), orderBy("at", "desc"), limit(300)),
    (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
    () => setMsgs([]),
  ), [chat.id]);
  // Al abrirlo (o si llega algo mientras está abierto) se marca como leído.
  useEffect(() => { if (chat.unread) waApi("chat", { chatId: chat.id, read: true }).catch(() => {}); }, [chat.id, chat.unread]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs?.length]);

  const send = async () => {
    if (sending || (!text.trim() && !file)) return;
    setSending(true); setError("");
    try {
      if (file) {
        if (file.size > 16 * 1024 * 1024) throw new Error("El archivo pasa de 16 MB");
        await waApi("send-media", { chatId: chat.id, name: file.name, mime: file.type || "application/octet-stream", data: await toBase64(file), caption: text.trim() });
        setFile(null);
      } else {
        await waApi("send", { chatId: chat.id, text: text.trim() });
      }
      setText("");
    } catch (e) { setError(e.message); }
    setSending(false);
  };
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const update = (patch) => waApi("chat", { chatId: chat.id, ...patch }).catch((e) => setError(e.message));

  let lastDay = "";
  return (
    <section className="wa-conv">
      <header className="wa-conv__head">
        <button className="wa-back" onClick={onBack} aria-label="Volver">←</button>
        <span className="wa-avatar">{(chatName(chat).replace(/^\+/, "")[0] || "?").toUpperCase()}</span>
        <div className="wa-conv__who">
          <b>{chatName(chat)}</b>
          <small>{chat.phone}{chat.profileName && chat.profileName !== chatName(chat) ? ` · «${chat.profileName}» en WhatsApp` : ""}</small>
        </div>
        <div className="wa-conv__tools">
          {chat.contactId
            ? <Link className="crm-btn ghost sm" to={`/dashboard/crm/contacts/${chat.contactId}`}>Ver ficha</Link>
            : <button className="crm-btn sm" onClick={() => setLinking(true)}>Ligar a contacto</button>}
          <Assignee chat={chat} onChange={(a) => update(a)} />
          <button className="crm-btn ghost sm" onClick={() => update({ archived: !chat.archived })}>{chat.archived ? "Desarchivar" : "Archivar"}</button>
        </div>
      </header>

      <div className="wa-msgs">
        {msgs === null ? <p className="wa-empty">Cargando…</p> : msgs.map((m) => {
          const day = dayLabel(m.at);
          const sep = day !== lastDay ? <div className="wa-day" key={`d${m.id}`}>{(lastDay = day)}</div> : null;
          return [sep, <Bubble key={m.id} m={m} chatId={chat.id} />];
        })}
        <div ref={bottom} />
      </div>

      <footer className="wa-compose">
        {error && <div className="wa-error">{error}</div>}
        {!open ? (
          <div className="wa-closed">
            Han pasado más de 24 h desde el último mensaje de este cliente (o aún no ha escrito). WhatsApp solo permite
            escribirle con una <b>plantilla aprobada por Meta</b>: llegará en la siguiente fase. Cuando él vuelva a escribir, podrás contestar aquí.
          </div>
        ) : (
          <>
            {file && <div className="wa-file">📎 {file.name} <small>({Math.ceil(file.size / 1024)} KB)</small> <button onClick={() => setFile(null)}>✕</button></div>}
            <div className="wa-compose__row">
              <button className="wa-attach" title="Adjuntar archivo" onClick={() => fileInput.current?.click()}>📎</button>
              <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,video/mp4,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
              <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
                placeholder={file ? "Comentario del archivo (opcional)" : "Escribe un mensaje · Enter envía, Mayús+Enter salto de línea"} />
              <button className="crm-btn" disabled={sending || (!text.trim() && !file)} onClick={send}>{sending ? "…" : "Enviar"}</button>
            </div>
          </>
        )}
      </footer>
      {linking && <LinkContact chat={chat} onClose={() => setLinking(false)} onPick={(id) => { setLinking(false); update({ contactId: id }); }} />}
    </section>
  );
}

function Bubble({ m, chatId }) {
  return (
    <div className={`wa-bubble ${m.dir === "out" ? "out" : "in"} ${m.status === "failed" ? "failed" : ""}`}>
      {m.media && <Media m={m} chatId={chatId} />}
      {m.text && <div className="wa-text">{m.text}</div>}
      <div className="wa-meta">
        {m.dir === "out" && m.byName && <span className="wa-by">{m.byName} · </span>}
        {hourLabel(m.at)}
        {m.dir === "out" && <span className={`wa-st ${m.status}`} title={m.status}>{STATUS_ICON[m.status] || ""}</span>}
      </div>
      {m.status === "failed" && m.error && <div className="wa-fail">⚠ {m.error}</div>}
    </div>
  );
}

// Los archivos están en el Storage privado: se pide un enlace temporal al abrirlos.
function Media({ m, chatId }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const kind = m.type;
  const inline = (kind === "image" || kind === "sticker") && m.media.path;
  useEffect(() => {
    if (!inline) return;
    waApi("file-url", { chatId, id: m.id }).then((r) => setUrl(r.url)).catch((e) => setErr(e.message));
  }, [inline, chatId, m.id]);
  if (m.media.pending) return <div className="wa-media">⏳ Descargando archivo…</div>;
  if (m.media.error) return <div className="wa-media">⚠ {m.media.error}</div>;
  if (inline) return url ? <a href={url} target="_blank" rel="noreferrer"><img className="wa-img" src={url} alt="" /></a> : <div className="wa-media">{err || "Cargando imagen…"}</div>;
  const openFile = () => waApi("file-url", { chatId, id: m.id }).then((r) => window.open(r.url, "_blank", "noopener")).catch((e) => setErr(e.message));
  const label = kind === "audio" ? (m.media.voice ? "🎤 Nota de voz" : "🎵 Audio") : kind === "video" ? "🎬 Vídeo" : `📄 ${m.media.filename || "Documento"}`;
  return <button className="wa-media wa-media--btn" onClick={openFile}>{label} <small>abrir</small>{err && <span> · {err}</span>}</button>;
}

function Assignee({ chat, onChange }) {
  const { items: employees } = useCrmCollection("employees");
  const people = employees.filter((e) => e.email).map((e) => ({ email: e.email.toLowerCase(), name: `${e.firstName || ""} ${e.lastName || ""}`.trim() || e.email }));
  return (
    <select className="wa-assign" value={chat.assigneeEmail || ""} onChange={(e) => {
      const p = people.find((x) => x.email === e.target.value);
      onChange({ assigneeEmail: p?.email || "", assigneeName: p?.name || "" });
    }} title="Asignado a">
      <option value="">Sin asignar</option>
      {people.map((p) => <option key={p.email} value={p.email}>👤 {p.name}</option>)}
    </select>
  );
}

function LinkContact({ chat, onClose, onPick }) {
  const perms = usePerms();
  const { items: all, loading } = useCrmCollection("contacts");
  const contacts = useMemo(() => perms.visible("contacts", all), [perms, all]);
  const [term, setTerm] = useState(chat.profileName || "");
  const name = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim();
  const found = useMemo(() => {
    const t = term.trim().toLowerCase();
    const d = t.replace(/\D/g, "");
    if (!t) return [];
    return contacts.filter((c) => [name(c), c.email, c.company, c.clientId].filter(Boolean).some((v) => String(v).toLowerCase().includes(t))
      || (d.length >= 6 && [c.phone, c.whatsapp].some((p) => String(p || "").replace(/\D/g, "").includes(d)))).slice(0, 30);
  }, [contacts, term]);
  return (
    <CrmModal title={`Ligar ${chat.phone} a un contacto`} onClose={onClose} maxWidth={560} footer={<button className="crm-btn ghost" onClick={onClose}>Cancelar</button>}>
      <input autoFocus className="crm-search" style={{ margin: "0 0 10px", width: "100%", maxWidth: "none" }} placeholder="Nombre, email, empresa, ID o teléfono…" value={term} onChange={(e) => setTerm(e.target.value)} />
      {loading ? <p>Cargando contactos…</p> : !term.trim() ? <p className="wa-hint">Escribe para buscar.</p> : found.length ? found.map((c) => (
        <div key={c.id} className="wa-pick" onClick={() => onPick(c.id)}>
          <b>{name(c) || "(sin nombre)"}</b> <small>{c.clientId || ""}</small>
          <div>{[c.phone, c.email, c.company].filter(Boolean).join(" · ") || "—"}</div>
        </div>
      )) : <p className="wa-hint">Ningún contacto coincide. Si es nuevo, créalo en CRM › Contactos con este teléfono ({chat.phone}) y vuelve a ligarlo.</p>}
    </CrmModal>
  );
}
