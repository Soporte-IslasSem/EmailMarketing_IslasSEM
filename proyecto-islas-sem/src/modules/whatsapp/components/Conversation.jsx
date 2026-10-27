import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import CrmModal from "../../crm/components/CrmModal";
import TaskModal from "../../crm/components/TaskModal";
import { useCrmCollection, crmCreate, crmUpdate } from "../../crm/lib/crm";
import { useTaskScope, useGoogleStatus } from "../../crm/lib/tasks";
import { useOrg } from "../../crm/lib/useOrg";
import { WaIcon, Flag } from "./WaBits";
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
    query(collection(db, "organizations", chat.orgId, "waChats", chat.id, "messages"), orderBy("at", "desc"), limit(300)),
    (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
    () => setMsgs([]),
  ), [chat.id, chat.orgId]);
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
            <b><WaIcon size={13} /> {chatName(chat)}</b>
            <small title={`${chat.phone}${chat.profileName && chat.profileName !== chatName(chat) ? ` · «${chat.profileName}»` : ""}`}>👤 {chat.assigneeName || "Sin asignar"}</small>
          </div>
          <div className="wa-conv__tools">
            <span className={`wa-window ${open ? "on" : ""}`} title="WhatsApp permite escribir libremente hasta 24 h después del último mensaje del cliente">
              {open ? `🟢 Ventana abierta · ${windowLeft(chat)}` : "⚪ Ventana cerrada"}
            </span>
            <button className="wa-icon" title={chat.unread ? "Marcar como leído" : "Marcar como no leído"} onClick={() => update(chat.unread ? { read: true } : { unread: true })}>{chat.unread ? "●" : "○"}</button>
            <button className="wa-icon" title={chat.starred ? "Quitar destacado" : "Destacar"} onClick={() => update({ starred: !chat.starred })}>{chat.starred ? "★" : "☆"}</button>
            {chat.assigneeEmail !== me && <button className="wa-icon" title="Asignármelo" onClick={() => update({ assigneeEmail: me, assigneeName: auth.currentUser?.displayName || me })}>🙋</button>}
            <button className="wa-icon" title={chat.archived ? "Desarchivar" : "Archivar"} onClick={() => update({ archived: !chat.archived })}>{chat.archived ? "📤" : "🗄️"}</button>
            <button className={`wa-icon ${panel ? "on" : ""}`} title="Ficha del chat" onClick={() => setPanel((p) => !p)}>ⓘ</button>
            {onClose && <button className="wa-icon" title="Cerrar" onClick={onClose}>✕</button>}
          </div>
        </header>

        <div className="wa-msgs">
          {msgs === null ? <p className="wa-empty">Cargando…</p> : !msgs.length ? <p className="wa-empty">Sin mensajes todavía.</p> : msgs.map((m) => {
            const day = dayLabel(m.at);
            const sep = day !== lastDay ? <div className="wa-day" key={`d${m.id}`}>{(lastDay = day)}</div> : null;
            if (m.dir === "event") return [sep, <EventLine key={m.id} m={m} />];
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

// Aviso en el historial (archivada, movida de columna, asignada…), como la banda azul de ManyContacts.
const EVENT_ICON = { archive: "🗄️", stage: "▥", assign: "👤", contact: "🔗", block: "🚫", info: "ℹ️" };
function EventLine({ m }) {
  return (
    <div className={`wa-event ${m.kind || "info"}`}>
      <span className="wa-event__ic">{EVENT_ICON[m.kind] || EVENT_ICON.info}</span>
      <span className="wa-event__text">{m.text}</span>
      <small>{hourLabel(m.at)}</small>
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
  const { orgId } = useOrg();
  const { items: contacts } = useCrmCollection("contacts");
  const { items: companies } = useCrmCollection("companies");
  const scope = useTaskScope();
  const [google] = useGoogleStatus();
  const [linking, setLinking] = useState(false);
  const [task, setTask] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [busy, setBusy] = useState("");
  const contact = contacts.find((c) => c.id === chat.contactId) || null;
  const company = contact?.companyId ? companies.find((c) => c.id === contact.companyId) : null;
  const files = msgs.filter((m) => m.media?.path).reverse();
  const stageRef = chat.funnelId && chat.stageId ? `${chat.funnelId}:${chat.stageId}` : "";
  // Campos del contacto editables aquí mismo (como ManyContacts); se guardan al salir del campo.
  const [f, setF] = useState(() => ({ name: "", email: "", notes: "", cif: "" }));
  const [loadedFor, setLoadedFor] = useState("");
  const key = `${contact?.id || "none"}|${company?.id || ""}`;
  if (loadedFor !== key && (contact || !chat.contactId)) {
    setLoadedFor(key);
    setF({
      name: contact ? `${contact.firstName || ""} ${contact.lastName || ""}`.trim() : chat.profileName || "",
      email: contact?.email || "", notes: contact?.notes || chat.notes || "", cif: company ? company.cif || "" : contact?.dni || "",
    });
  }
  const nextClientId = () => {
    let max = 0;
    contacts.forEach((c) => { const m = /^CLI-(\d+)$/.exec(c.clientId || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return "CLI-" + String(max + 1).padStart(4, "0");
  };
  // Si el chat aún no es un contacto del CRM, se crea al rellenar el primer dato.
  const ensureContact = async () => {
    if (contact) return contact.id;
    if (chat.contactId) return chat.contactId;
    const [firstName, ...rest] = (f.name || chat.profileName || "").trim().split(/\s+/);
    const ref = await crmCreate("contacts", orgId, {
      firstName: firstName || "", lastName: rest.join(" "), phone: chat.phone, whatsapp: chat.phone, email: "",
      clientId: nextClientId(), source: "WhatsApp", relation: "nuevo", stage: "Lead", notes: "", custom: {},
    });
    await update({ contactId: ref.id });
    return ref.id;
  };
  const saveField = async (field) => {
    try {
      if (field === "name") {
        if (!f.name.trim() && !contact) return;
        const [firstName, ...rest] = f.name.trim().split(/\s+/);
        const id = await ensureContact();
        await crmUpdate("contacts", id, { firstName: firstName || "", lastName: rest.join(" ") });
        await update({ contactId: id }); // refresca el nombre del chat
      } else if (field === "email") {
        const email = f.email.trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return setError("El email no es válido");
        if (!email && !contact) return;
        await crmUpdate("contacts", await ensureContact(), { email });
      } else if (field === "notes") {
        if (!f.notes.trim() && !contact) return;
        await crmUpdate("contacts", await ensureContact(), { notes: f.notes });
      } else if (field === "cif") {
        if (company) await crmUpdate("companies", company.id, { cif: f.cif.trim().toUpperCase() });
        else if (f.cif.trim() || contact) await crmUpdate("contacts", await ensureContact(), { dni: f.cif.trim().toUpperCase() });
      }
    } catch (e) { setError("No se pudo guardar: " + e.message); }
  };
  const setCompany = async (id) => {
    try {
      const co = companies.find((c) => c.id === id);
      await crmUpdate("contacts", await ensureContact(), { companyId: id || "", company: co?.name || "" });
    } catch (e) { setError("No se pudo guardar: " + e.message); }
  };
  const blur = (field, cur) => () => cur !== undefined && saveField(field);

  const exportChat = async () => {
    setBusy("export");
    try {
      const s = await getDocs(query(collection(db, "organizations", chat.orgId, "waChats", chat.id, "messages"), orderBy("at", "asc")));
      const lines = s.docs.map((d) => d.data()).map((m) => (m.dir === "event" ? `[${dateTime(m.at)}] — ${m.text} —`
        : `[${dateTime(m.at)}] ${m.dir === "out" ? (m.byName || "Empresa") : chatName(chat)}: ${m.text || ""}${m.media ? ` <${m.media.filename || m.type}>` : ""}`));
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
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <aside className="wa-panel">
      <div className="wa-panel__head"><b>Ficha del contacto</b><button className="wa-icon" onClick={onClose} title="Cerrar ficha">✕</button></div>
      <div className="wa-panel__body">
        <label className="wa-field"><span>🏢</span>
          <select value={contact?.companyId || ""} onChange={(e) => setCompany(e.target.value)} title="Empresa del contacto">
            <option value="">Empresa del contacto</option>
            {companies.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="wa-field"><span>👤</span>
          <select value={chat.assigneeEmail || ""} title="Agente" onChange={(e) => {
            const p = people.find((x) => x.email === e.target.value);
            update({ assigneeEmail: p?.email || "", assigneeName: p?.name || "" });
          }}>
            <option value="">Sin asignar</option>
            {people.map((p) => <option key={p.email} value={p.email}>{p.name}{cfg?.away?.[p.email] ? " (ausente)" : ""}</option>)}
          </select>
        </label>
        <label className="wa-field"><span>👥</span>
          <select value={chat.teamId || ""} title="Equipo" onChange={(e) => update({ teamId: e.target.value })}>
            <option value="">Selecciona un equipo</option>
            {(cfg?.teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="wa-field"><span>▥</span>
          <select value={stageRef} title="Embudo y columna" onChange={(e) => update({ stage: e.target.value })}>
            <option value="">Fuera de los embudos</option>
            {cfg?.funnels.map((fu) => (
              <optgroup key={fu.id} label={fu.name}>
                {fu.stages.map((s) => <option key={s.id} value={`${fu.id}:${s.id}`}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="wa-field"><span>🏷</span>
          <select value="" title="Añade una etiqueta" onChange={(e) => e.target.value && update({ tags: [...(chat.tags || []), e.target.value] })}>
            <option value="">{cfg?.tags.length ? "Añade una etiqueta" : "Sin etiquetas creadas"}</option>
            {(cfg?.tags || []).filter((t) => !(chat.tags || []).includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        {(chat.tags || []).length > 0 && (
          <div className="wa-chips" style={{ margin: "-2px 0 8px" }}>
            {chat.tags.map((id) => { const t = cfg?.tags.find((x) => x.id === id); return t ? <button key={id} className="wa-chip on" style={{ background: t.color, borderColor: t.color }} title="Quitar" onClick={() => update({ tags: chat.tags.filter((x) => x !== id) })}>{t.name} ✕</button> : null; })}
          </div>
        )}
        {!cfg?.tags.length && perms.isAdmin && <small className="wa-hint" style={{ display: "block", margin: "-4px 0 8px" }}><Link to="/dashboard/whatsapp/ajustes?tab=tags">Crear etiquetas</Link></small>}

        <div className="wa-box"><WaIcon size={16} /> <Flag phone={chat.phone} /> <span>{chat.phone}</span></div>
        <label className="wa-field box"><span>👤</span><input value={f.name} onChange={set("name")} onBlur={blur("name", f.name)} placeholder="Nombre del contacto" /></label>
        <label className="wa-field box"><span>✉️</span><input value={f.email} onChange={set("email")} onBlur={blur("email", f.email)} placeholder="Email de contacto" type="email" /></label>
        <label className="wa-field box notes"><span>📝</span><textarea rows={3} value={f.notes} onChange={set("notes")} onBlur={blur("notes", f.notes)} placeholder="Notas del contacto…" /></label>
        <label className="wa-field box stacked"><small>{company ? `CIF de ${company.name}` : "CIF / DNI"}</small><input value={f.cif} onChange={set("cif")} onBlur={blur("cif", f.cif)} placeholder="Escribe CIF…" /></label>
        {chat.optOut && <p className="wa-tag bad" style={{ display: "inline-block" }}>Pidió la BAJA de difusiones</p>}

        <div className="wa-twin">
          <button className={showFiles ? "on" : ""} title={`Archivos de la conversación (${files.length})`} onClick={() => setShowFiles((v) => !v)}>📎 <small>{files.length}</small></button>
          <button title="Nueva tarea o cita con este contacto" onClick={async () => { try { setTask(await ensureContact()); } catch (e) { setError(e.message); } }}>📅</button>
        </div>
        {showFiles && (
          <div className="wa-files">
            {files.length ? files.slice(0, 50).map((m) => (
              <button key={m.id} onClick={() => fileUrl(m)}>{m.type === "image" ? "📷" : m.type === "audio" ? "🎤" : m.type === "video" ? "🎬" : "📄"} {m.media.filename || dateTime(m.at)}</button>
            )) : <small className="wa-hint">Ningún archivo en esta conversación.</small>}
          </div>
        )}
        <button className="wa-wide" onClick={exportChat} disabled={busy === "export"}>{busy === "export" ? "Exportando…" : "⬆ Exportar conversación"}</button>
        <button className={`wa-wide ${chat.blocked ? "" : "danger"}`} onClick={toggleBlock} disabled={busy === "block"}>{chat.blocked ? "Desbloquear" : "✋ Bloquear"}</button>
        <div className="wa-panel__links">
          {chat.contactId
            ? <><Link to={`/dashboard/crm/contacts/${chat.contactId}`}>Abrir ficha completa en el CRM</Link> · <button className="wa-link-btn" onClick={() => update({ contactId: "" })}>Desligar</button></>
            : <button className="wa-link-btn" onClick={() => setLinking(true)}>Ligar a un contacto que ya existe</button>}
        </div>
        <p className="wa-hint" style={{ marginTop: 8 }}>Chat creado: {dateTime(chat.createdAt)}{chat.stageAt ? <><br />En esta columna desde: {dateTime(chat.stageAt)}</> : null}</p>
      </div>
      {linking && <LinkContact chat={chat} onClose={() => setLinking(false)} onPick={(id) => { setLinking(false); update({ contactId: id }); }} />}
      {task && <TaskModal orgId={orgId} task={null} scope={scope} google={google} onClose={() => setTask(false)}
        preset={{ type: "Tarea", title: `WhatsApp: ${chatName(chat)}`, entity: "contact", entityId: task, contactId: task, link: `Contacto «${chatName(chat)}»` }} />}
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
