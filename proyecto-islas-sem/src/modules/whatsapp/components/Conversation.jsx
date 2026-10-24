import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import CrmModal from "../../crm/components/CrmModal";
import { useCrmCollection } from "../../crm/lib/crm";
import { usePerms } from "../../crm/lib/permissions";
import { toBase64 } from "../../contracts/lib/api";
import TemplateFields from "./TemplateFields";
import {
  waApi, inWindow, windowLeft, chatName, initial, dayLabel, hourLabel, dateTime, STATUS_ICON, STATUS_LABEL, EMOJIS, templatePayload, usePeople,
} from "../lib/api";

// Una conversación: cabecera, mensajes en tiempo real, caja de escribir (respuestas rápidas
// con "/", emojis, archivos, responder a un mensaje, plantillas) y la ficha lateral del chat
// (contacto, agente, equipo, embudo, etiquetas, notas, archivos, exportar, bloquear).
export default function Conversation({ chat, cfg, onBack, onClose }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [pop, setPop] = useState(""); // "emoji" | "quick"
  const [tplOpen, setTplOpen] = useState(false);
  const [panel, setPanel] = useState(() => window.innerWidth > 1100);
  const bottom = useRef(null);
  const fileInput = useRef(null);
  const box = useRef(null);
  const open = inWindow(chat);
  const me = (auth.currentUser?.email || "").toLowerCase();

  useEffect(() => onSnapshot(
    query(collection(db, "waChats", chat.id, "messages"), orderBy("at", "desc"), limit(300)),
    (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
    () => setMsgs([]),
  ), [chat.id]);
  // Al abrirlo (o si llega algo mientras está abierto) se marca como leído.
  useEffect(() => { if (chat.unread) waApi("chat", { chatId: chat.id, read: true }).catch(() => {}); }, [chat.id, chat.unread]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs?.length]);

  const byId = useMemo(() => Object.fromEntries((msgs || []).map((m) => [m.id, m])), [msgs]);
  const firstName = (chatName(chat).split(" ")[0] || "").replace(/^\+.*/, "");
  const quick = useMemo(() => (cfg?.quickReplies || []).filter((q) => q.shared || q.ownerEmail === me), [cfg, me]);
  const slash = text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const quickShown = (slash !== null || pop === "quick") ? quick.filter((q) => !slash || q.title.toLowerCase().includes(slash) || q.text.toLowerCase().includes(slash)).slice(0, 12) : [];

  const send = async () => {
    if (sending || (!text.trim() && !file)) return;
    setSending(true); setError("");
    try {
      if (file) {
        if (file.size > 16 * 1024 * 1024) throw new Error("El archivo pasa de 16 MB");
        await waApi("send-media", { chatId: chat.id, name: file.name, mime: file.type || "application/octet-stream", data: await toBase64(file), caption: text.trim() });
        setFile(null);
      } else {
        await waApi("send", { chatId: chat.id, text: text.trim(), ...(replyTo ? { replyToWamid: replyTo.wamid } : {}) });
      }
      setText(""); setReplyTo(null);
    } catch (e) { setError(e.message); }
    setSending(false);
  };
  const pickQuick = (q) => { setText(q.text.replace(/\{nombre\}/gi, firstName)); setPop(""); box.current?.focus(); };
  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (quickShown.length && slash !== null) pickQuick(quickShown[0]); else send();
    }
    if (e.key === "Escape") { setPop(""); setReplyTo(null); }
  };
  const update = (patch) => waApi("chat", { chatId: chat.id, ...patch }).catch((e) => setError(e.message));

  let lastDay = "";
  return (
    <div className={`wa-convwrap ${panel ? "with-panel" : ""}`}>
      <section className="wa-conv">
        <header className="wa-conv__head">
          {onBack && <button className="wa-back" onClick={onBack} aria-label="Volver">←</button>}
          <span className="wa-avatar">{initial(chat)}</span>
          <div className="wa-conv__who" onClick={() => setPanel((p) => !p)} style={{ cursor: "pointer" }}>
            <b>{chatName(chat)}</b>
            <small>{chat.phone}{chat.profileName && chat.profileName !== chatName(chat) ? ` · «${chat.profileName}»` : ""}</small>
          </div>
          <div className="wa-conv__tools">
            <span className={`wa-window ${open ? "on" : ""}`} title="WhatsApp permite escribir libremente hasta 24 h después del último mensaje del cliente">
              {open ? `🟢 Ventana abierta · ${windowLeft(chat)}` : "⚪ Ventana cerrada"}
            </span>
            <button className="wa-icon" title={chat.starred ? "Quitar destacado" : "Destacar"} onClick={() => update({ starred: !chat.starred })}>{chat.starred ? "★" : "☆"}</button>
            <button className="wa-icon" title={chat.archived ? "Desarchivar" : "Archivar"} onClick={() => update({ archived: !chat.archived })}>{chat.archived ? "📤" : "🗄️"}</button>
            <button className={`wa-icon ${panel ? "on" : ""}`} title="Ficha del chat" onClick={() => setPanel((p) => !p)}>ⓘ</button>
            {onClose && <button className="wa-icon" title="Cerrar" onClick={onClose}>✕</button>}
          </div>
        </header>

        <div className="wa-msgs">
          {msgs === null ? <p className="wa-empty">Cargando…</p> : !msgs.length ? <p className="wa-empty">Sin mensajes todavía.</p> : msgs.map((m) => {
            const day = dayLabel(m.at);
            const sep = day !== lastDay ? <div className="wa-day" key={`d${m.id}`}>{(lastDay = day)}</div> : null;
            return [sep, <Bubble key={m.id} m={m} chatId={chat.id} quoted={m.replyTo ? byId[m.replyTo] : null} onReply={open && m.wamid && !String(m.wamid).startsWith("local-") ? () => { setReplyTo(m); box.current?.focus(); } : null} />];
          })}
          <div ref={bottom} />
        </div>

        <footer className="wa-compose">
          {error && <div className="wa-error">{error} <button onClick={() => setError("")}>✕</button></div>}
          {chat.blocked ? (
            <div className="wa-closed">🚫 Este número está bloqueado. Desbloquéalo en la ficha del chat (ⓘ) para volver a escribirle.</div>
          ) : !open ? (
            <div className="wa-closed">
              <span>Han pasado más de 24 h desde el último mensaje del cliente (o aún no ha escrito). WhatsApp solo permite escribirle con una <b>plantilla aprobada por Meta</b>. Cuando conteste, podrás escribir libremente.</span>
              <button className="crm-btn sm" onClick={() => setTplOpen(true)}>📋 Enviar plantilla</button>
            </div>
          ) : (
            <>
              {replyTo && (
                <div className="wa-replying">
                  <div><b>{replyTo.dir === "out" ? (replyTo.byName || "Tú") : chatName(chat)}</b><span>{replyTo.text || "Archivo"}</span></div>
                  <button onClick={() => setReplyTo(null)}>✕</button>
                </div>
              )}
              {file && <div className="wa-file">📎 {file.name} <small>({Math.ceil(file.size / 1024)} KB)</small> <button onClick={() => setFile(null)}>✕</button></div>}
              {quickShown.length > 0 && (
                <div className="wa-pop wa-pop--quick">
                  {quickShown.map((q) => (
                    <button key={q.id} onClick={() => pickQuick(q)}><b>/{q.title}</b><span>{q.text}</span></button>
                  ))}
                </div>
              )}
              {(slash !== null || pop === "quick") && !quickShown.length && (
                <div className="wa-pop wa-pop--quick"><p className="wa-hint" style={{ padding: 10, margin: 0 }}>{quick.length ? "Ninguna respuesta rápida coincide." : <>Aún no hay respuestas rápidas. Créalas en <Link to="/dashboard/whatsapp/ajustes?tab=quick">Ajustes</Link>.</>}</p></div>
              )}
              {pop === "emoji" && (
                <div className="wa-pop wa-pop--emoji">
                  {EMOJIS.map((e) => <button key={e} onClick={() => { setText((t) => t + e); box.current?.focus(); }}>{e}</button>)}
                </div>
              )}
              <div className="wa-compose__row">
                <button className="wa-attach" title="Emojis" onClick={() => setPop((p) => (p === "emoji" ? "" : "emoji"))}>😊</button>
                <button className="wa-attach" title="Adjuntar archivo" onClick={() => fileInput.current?.click()}>📎</button>
                <button className="wa-attach" title="Respuestas rápidas (o escribe /)" onClick={() => setPop((p) => (p === "quick" ? "" : "quick"))}>⚡</button>
                <button className="wa-attach" title="Enviar plantilla" onClick={() => setTplOpen(true)}>📋</button>
                <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,video/mp4,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                  onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
                <textarea ref={box} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
                  placeholder={file ? "Comentario del archivo (opcional)" : "Escribe un mensaje · / respuestas rápidas · Mayús+Enter salto de línea"} />
                <button className="crm-btn" disabled={sending || (!text.trim() && !file)} onClick={send}>{sending ? "…" : "Enviar"}</button>
              </div>
            </>
          )}
        </footer>
        {tplOpen && <SendTemplateModal chat={chat} onClose={() => setTplOpen(false)} />}
      </section>
      {panel && <ChatPanel key={chat.id} chat={chat} cfg={cfg} msgs={msgs || []} update={update} setError={setError} onClose={() => setPanel(false)} />}
    </div>
  );
}

function Bubble({ m, chatId, quoted, onReply }) {
  const tpl = m.type === "template";
  return (
    <div className={`wa-bubble ${m.dir === "out" ? "out" : "in"} ${m.status === "failed" ? "failed" : ""} ${tpl ? "tpl" : ""}`}>
      {onReply && <button className="wa-bubble__reply" title="Responder" onClick={onReply}>↩</button>}
      {quoted && <div className="wa-quote"><b>{quoted.dir === "out" ? (quoted.byName || "Tú") : "Cliente"}</b><span>{quoted.text || "Archivo"}</span></div>}
      {tpl && <div className="wa-tpl-tag">📋 Plantilla {m.template?.name}</div>}
      {m.media && <Media m={m} chatId={chatId} />}
      {m.text && <div className="wa-text">{m.text}</div>}
      <div className="wa-meta">
        {m.dir === "out" && m.byName && <span className="wa-by">{m.auto ? "🤖 " : ""}{m.byName} · </span>}
        {hourLabel(m.at)}
        {m.dir === "out" && <span className={`wa-st ${m.status}`} title={STATUS_LABEL[m.status] || m.status}>{STATUS_ICON[m.status] || ""}</span>}
      </div>
      {m.reaction && <span className="wa-reaction">{m.reaction}</span>}
      {m.status === "failed" && m.error && <div className="wa-fail">⚠ {m.error}</div>}
    </div>
  );
}

// Los archivos están en el Storage privado: se pide un enlace temporal al abrirlos.
function Media({ m, chatId }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const kind = m.type === "template" ? (String(m.media.mime).startsWith("image/") ? "image" : String(m.media.mime).startsWith("video/") ? "video" : "document") : m.type;
  const inline = (kind === "image" || kind === "sticker" || kind === "audio") && m.media.path;
  useEffect(() => {
    if (!inline) return;
    waApi("file-url", { chatId, id: m.id }).then((r) => setUrl(r.url)).catch((e) => setErr(e.message));
  }, [inline, chatId, m.id]);
  if (m.media.pending) return <div className="wa-media">⏳ Descargando archivo…</div>;
  if (m.media.error) return <div className="wa-media">⚠ {m.media.error}</div>;
  if (inline && kind === "audio") return url ? <audio className="wa-audio" controls src={url} preload="none" /> : <div className="wa-media">{err || "Cargando audio…"}</div>;
  if (inline) return url ? <a href={url} target="_blank" rel="noreferrer"><img className="wa-img" src={url} alt="" /></a> : <div className="wa-media">{err || "Cargando imagen…"}</div>;
  const openFile = () => waApi("file-url", { chatId, id: m.id }).then((r) => window.open(r.url, "_blank", "noopener")).catch((e) => setErr(e.message));
  const label = kind === "video" ? "🎬 Vídeo" : `📄 ${m.media.filename || "Documento"}`;
  return <button className="wa-media wa-media--btn" onClick={openFile}>{label} <small>abrir</small>{err && <span> · {err}</span>}</button>;
}

/* ------------------------------------------------------------------ ficha lateral */

function ChatPanel({ chat, cfg, msgs, update, setError, onClose }) {
  const perms = usePerms();
  const people = usePeople();
  const { items: contacts } = useCrmCollection("contacts");
  const [notes, setNotes] = useState(chat.notes || "");
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState("");
  const contact = contacts.find((c) => c.id === chat.contactId);
  const files = msgs.filter((m) => m.media?.path).reverse();
  const stageRef = chat.funnelId && chat.stageId ? `${chat.funnelId}:${chat.stageId}` : "";

  const exportChat = async () => {
    setBusy("export");
    try {
      const s = await getDocs(query(collection(db, "waChats", chat.id, "messages"), orderBy("at", "asc")));
      const lines = s.docs.map((d) => d.data()).map((m) => `[${dateTime(m.at)}] ${m.dir === "out" ? (m.byName || "Empresa") : chatName(chat)}: ${m.text || ""}${m.media ? ` <${m.media.filename || m.type}>` : ""}`);
      const blob = new Blob([`Conversación de WhatsApp con ${chatName(chat)} (${chat.phone})\n\n${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `whatsapp-${chat.phone.replace(/\D/g, "")}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { setError(e.message); }
    setBusy("");
  };
  const toggleBlock = async () => {
    if (!chat.blocked && !window.confirm(`¿Bloquear ${chat.phone}? No podrá escribiros por WhatsApp hasta que lo desbloquees.`)) return;
    setBusy("block");
    await waApi("block", { chatId: chat.id, blocked: !chat.blocked }).catch((e) => setError(e.message));
    setBusy("");
  };
  const fileUrl = (m) => waApi("file-url", { chatId: chat.id, id: m.id }).then((r) => window.open(r.url, "_blank", "noopener")).catch((e) => setError(e.message));

  return (
    <aside className="wa-panel">
      <div className="wa-panel__head"><b>Ficha del chat</b><button className="wa-icon" onClick={onClose} title="Cerrar ficha">✕</button></div>
      <div className="wa-panel__body">
        <div className="wa-panel__id">
          <span className="wa-avatar lg">{initial(chat)}</span>
          <b>{chatName(chat)}</b>
          <small>{chat.phone}</small>
          {chat.optOut && <span className="wa-tag bad">Pidió la BAJA de difusiones</span>}
        </div>

        <h4>Contacto del CRM</h4>
        {chat.contactId ? (
          <div className="wa-panel__contact">
            <Link to={`/dashboard/crm/contacts/${chat.contactId}`}>👤 {chat.contactName || "Ver ficha"}</Link>
            {contact && <small>{[contact.email, contact.company, contact.clientId].filter(Boolean).join(" · ")}</small>}
            <button className="wa-link-btn" onClick={() => update({ contactId: "" })}>Desligar</button>
          </div>
        ) : <button className="crm-btn sm" onClick={() => setLinking(true)}>Ligar a un contacto</button>}

        <h4>Agente</h4>
        <select className="wa-select" value={chat.assigneeEmail || ""} onChange={(e) => {
          const p = people.find((x) => x.email === e.target.value);
          update({ assigneeEmail: p?.email || "", assigneeName: p?.name || "" });
        }}>
          <option value="">Sin asignar</option>
          {people.map((p) => <option key={p.email} value={p.email}>{p.name}{cfg?.away?.[p.email] ? " (ausente)" : ""}</option>)}
        </select>

        {cfg?.teams.length > 0 && <>
          <h4>Equipo</h4>
          <select className="wa-select" value={chat.teamId || ""} onChange={(e) => update({ teamId: e.target.value })}>
            <option value="">Sin equipo</option>
            {cfg.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </>}

        <h4>Embudo</h4>
        <select className="wa-select" value={stageRef} onChange={(e) => update({ stage: e.target.value })}>
          <option value="">Fuera de los embudos</option>
          {cfg?.funnels.map((f) => (
            <optgroup key={f.id} label={f.name}>
              {f.stages.map((s) => <option key={s.id} value={`${f.id}:${s.id}`}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>

        <h4>Etiquetas</h4>
        <div className="wa-chips">
          {(cfg?.tags || []).map((t) => {
            const on = (chat.tags || []).includes(t.id);
            return <button key={t.id} className={`wa-chip ${on ? "on" : ""}`} style={on ? { background: t.color, borderColor: t.color } : { borderColor: t.color, color: t.color }}
              onClick={() => update({ tags: on ? chat.tags.filter((x) => x !== t.id) : [...(chat.tags || []), t.id] })}>{t.name}</button>;
          })}
          {!cfg?.tags.length && <small className="wa-hint">Sin etiquetas. {perms.isAdmin && <Link to="/dashboard/whatsapp/ajustes?tab=tags">Crear</Link>}</small>}
        </div>

        <h4>Notas internas</h4>
        <textarea className="wa-notes" rows={4} value={notes} placeholder="Solo las ve el equipo…" onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (chat.notes || "") && update({ notes })} />

        <h4>Archivos ({files.length})</h4>
        <div className="wa-files">
          {files.length ? files.slice(0, 30).map((m) => (
            <button key={m.id} onClick={() => fileUrl(m)}>{m.type === "image" ? "📷" : m.type === "audio" ? "🎤" : m.type === "video" ? "🎬" : "📄"} {m.media.filename || dateTime(m.at)}</button>
          )) : <small className="wa-hint">Ninguno.</small>}
        </div>

        <h4>Acciones</h4>
        <div className="wa-panel__actions">
          <button className="crm-btn ghost sm" onClick={() => update({ unread: true })}>Marcar como no leído</button>
          <button className="crm-btn ghost sm" onClick={exportChat} disabled={busy === "export"}>{busy === "export" ? "Exportando…" : "⬇ Exportar conversación"}</button>
          <button className={`crm-btn sm ${chat.blocked ? "ghost" : "danger"}`} onClick={toggleBlock} disabled={busy === "block"}>{chat.blocked ? "Desbloquear número" : "🚫 Bloquear número"}</button>
        </div>
        <p className="wa-hint" style={{ marginTop: 10 }}>Chat creado: {dateTime(chat.createdAt)}{chat.stageAt ? <><br />En esta columna desde: {dateTime(chat.stageAt)}</> : null}</p>
      </div>
      {linking && <LinkContact chat={chat} onClose={() => setLinking(false)} onPick={(id) => { setLinking(false); update({ contactId: id }); }} />}
    </aside>
  );
}

function LinkContact({ chat, onClose, onPick }) {
  const perms = usePerms();
  const { items: all, loading } = useCrmCollection("contacts");
  const contacts = useMemo(() => perms.visible("contacts", all), [perms, all]);
  const [term, setTerm] = useState(chat.profileName || chat.phone.slice(-9));
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

/* ------------------------------------------------------------------ plantillas */

export function SendTemplateModal({ chat, onClose }) {
  const [v, setV] = useState({ key: "", params: { header: [], body: [], buttons: {} }, file: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try {
      await waApi("send-template", { chatId: chat.id, ...(await templatePayload(v, toBase64)) });
      onClose();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <CrmModal title={`Enviar plantilla a ${chatName(chat)}`} onClose={onClose} maxWidth={820}
      footer={<><button className="crm-btn ghost" onClick={onClose}>Cancelar</button><button className="crm-btn" onClick={go} disabled={busy || !v.key}>{busy ? "Enviando…" : "Enviar"}</button></>}>
      <TemplateFields value={v} onChange={setV} />
      {err && <p className="wa-err">{err}</p>}
      <p className="wa-hint">Las plantillas de marketing y utilidad tienen coste por conversación según las tarifas de Meta.</p>
    </CrmModal>
  );
}

// Iniciar una conversación nueva: a un contacto del CRM o a un número, con una plantilla.
export function NewChatModal({ onClose, onStarted }) {
  const perms = usePerms();
  const { items: all } = useCrmCollection("contacts");
  const contacts = useMemo(() => perms.visible("contacts", all), [perms, all]);
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState(null);
  const [phone, setPhone] = useState("");
  const [v, setV] = useState({ key: "", params: { header: [], body: [], buttons: {} }, file: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const name = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim();
  const found = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (t.length < 2) return [];
    return contacts.filter((c) => (c.phone || c.whatsapp) && [name(c), c.email, c.company, c.phone, c.whatsapp].filter(Boolean).some((x) => String(x).toLowerCase().includes(t))).slice(0, 8);
  }, [contacts, term]);
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await waApi("send-template", { ...(picked ? { contactId: picked.id } : {}), phone, ...(await templatePayload(v, toBase64)) });
      onStarted(r.chatId);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <CrmModal title="Nuevo chat de WhatsApp" onClose={onClose} maxWidth={820}
      footer={<><button className="crm-btn ghost" onClick={onClose}>Cancelar</button><button className="crm-btn" onClick={go} disabled={busy || !v.key || !phone.trim()}>{busy ? "Enviando…" : "Iniciar chat"}</button></>}>
      <p className="wa-hint" style={{ marginTop: 0 }}>WhatsApp obliga a empezar con una plantilla aprobada. Cuando el cliente conteste, se abre la ventana de 24 h para escribir libremente.</p>
      <div className="crm-two">
        <div className="crm-field">
          <label>Buscar contacto del CRM</label>
          <input value={term} placeholder="Nombre, email, empresa o teléfono…" onChange={(e) => { setTerm(e.target.value); setPicked(null); }} />
          {found.length > 0 && !picked && (
            <div className="wa-suggest">
              {found.map((c) => <button key={c.id} onClick={() => { setPicked(c); setTerm(name(c)); setPhone(c.whatsapp || c.phone || ""); }}><b>{name(c) || c.email}</b><small>{c.whatsapp || c.phone}</small></button>)}
            </div>
          )}
        </div>
        <div className="crm-field">
          <label>Número de WhatsApp</label>
          <input value={phone} placeholder="+34 600 000 000" onChange={(e) => setPhone(e.target.value)} />
          {picked && <small className="wa-hint">Contacto: {name(picked)}</small>}
        </div>
      </div>
      <div style={{ height: 12 }} />
      <TemplateFields value={v} onChange={setV} />
      {err && <p className="wa-err">{err}</p>}
    </CrmModal>
  );
}
