import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import CrmModal from "../../crm/components/CrmModal";
import { useCrmCollection } from "../../crm/lib/crm";
import { usePerms } from "../../crm/lib/permissions";
import { useClientTypes, typesOf } from "../../crm/lib/clientTypes";
import { toBase64 } from "../../contracts/lib/api";
import TemplateFields from "../components/TemplateFields";
import { waApi, useWaCollection, useWaConfig, templatePayload, dateTime, STATUS_LABEL } from "../lib/api";
import "../../crm/crm.styles.css";
import "../whatsapp.css";

// Difusiones: una plantilla aprobada a muchos contactos a la vez (por tipo/lista del CRM, por
// columna de un embudo o por etiqueta), al momento o programada. Quien respondió BAJA no la
// recibe. El servidor la envía por tandas y aquí se ven los contadores en tiempo real.
const BC_STATUS = { scheduled: ["Programada", "wait"], queued: ["En cola", "wait"], sending: ["Enviando", "wait"], done: ["Enviada", "ok"], cancelled: ["Cancelada", "bad"], failed: ["Detenida", "bad"] };

export default function Broadcasts() {
  const perms = usePerms();
  const items = useWaCollection("waBroadcasts");
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState(null);
  const [msg, setMsg] = useState(null);
  const list = useMemo(() => (items || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [items]);
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const cancel = async (b) => {
    if (!window.confirm(`¿Cancelar la difusión «${b.name}»? Lo ya enviado no se puede retirar.`)) return;
    try { await waApi("broadcasts/cancel", { id: b.id }); } catch (e) { setMsg({ err: true, text: e.message }); }
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div><h1 style={{ margin: 0 }}>Difusiones</h1><p>Envíos masivos de WhatsApp con plantillas aprobadas por Meta.</p></div>
        {perms.isAdmin && <button className="crm-btn" onClick={() => setCreating(true)}>+ Nueva difusión</button>}
      </div>
      {msg && <p className={msg.err ? "wa-err" : "wa-ok"}>{msg.text}</p>}
      {items === null ? <p>Cargando…</p> : !list.length ? (
        <div className="wa-card"><p className="wa-hint" style={{ margin: 0 }}>Aún no hay difusiones.</p></div>
      ) : (
        <table className="crm-table">
          <thead><tr><th>Difusión</th><th>Estado</th><th>Destinatarios</th><th>Enviados</th><th>Entregados</th><th>Leídos</th><th>Fallidos</th><th /></tr></thead>
          <tbody>
            {list.map((b) => {
              const [label, cls] = BC_STATUS[b.status] || [b.status, "wait"];
              return (
                <tr key={b.id}>
                  <td><b style={{ cursor: "pointer" }} onClick={() => setView(b)}>{b.name}</b><br /><small className="wa-hint">📋 {b.template?.name} · {b.status === "scheduled" ? `para ${dateTime(b.sendAt)}` : dateTime(b.createdAt)} · {b.createdByName}</small></td>
                  <td><span className={`wa-st-pill ${cls}`}>{label}</span>{b.error && <div className="wa-fail">{b.error}</div>}</td>
                  <td>{b.total}{b.skipped ? <small className="wa-hint"> (+{b.skipped} con BAJA)</small> : null}</td>
                  <td>{b.sent} <small className="wa-hint">{pct(b.sent, b.total)}%</small><div className="wa-progress"><i style={{ width: `${pct(b.sent + b.failed, b.total)}%` }} /></div></td>
                  <td>{b.delivered} <small className="wa-hint">{pct(b.delivered, b.sent)}%</small></td>
                  <td>{b.read} <small className="wa-hint">{pct(b.read, b.sent)}%</small></td>
                  <td>{b.failed}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="crm-btn ghost sm" onClick={() => setView(b)}>Detalle</button>
                    {perms.isAdmin && ["scheduled", "queued", "sending"].includes(b.status) && <button className="crm-btn ghost sm" onClick={() => cancel(b)}>Cancelar</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {creating && <CreateBroadcast onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); setMsg({ text: `Difusión creada: ${r.total} destinatario${r.total === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} excluidos por BAJA o bloqueo)` : ""}.` }); }} />}
      {view && <BroadcastDetail b={view} onClose={() => setView(null)} />}
    </div>
  );
}

function BroadcastDetail({ b, onClose }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    getDocs(query(collection(db, "waBroadcasts", b.id, "recipients"), limit(2000))).then((s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })))).catch(() => setRows([]));
  }, [b.id]);
  const shown = (rows || []).filter((r) => filter === "all" || r.status === filter);
  const name = (r) => `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.name || "";
  return (
    <CrmModal title={`Difusión «${b.name}»`} onClose={onClose} maxWidth={760} footer={<button className="crm-btn ghost" onClick={onClose}>Cerrar</button>}>
      <div className="wa-filters" style={{ padding: 0, marginBottom: 10 }}>
        {[["all", "Todos"], ["pending", "Pendientes"], ["sent", "Enviados"], ["failed", "Fallidos"]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {rows === null ? <p>Cargando…</p> : (
        <table className="crm-table">
          <thead><tr><th>Contacto</th><th>Número</th><th>Estado</th></tr></thead>
          <tbody>{shown.slice(0, 500).map((r) => (
            <tr key={r.id}><td>{name(r) || "—"}</td><td>+{r.waId}</td><td>{r.status === "pending" ? "Pendiente" : STATUS_LABEL[r.status] || r.status}{r.error && <div className="wa-fail">{r.error}</div>}</td></tr>
          ))}</tbody>
        </table>
      )}
      <p className="wa-hint">Las respuestas llegan a WhatsApp › Chats como conversaciones normales.</p>
    </CrmModal>
  );
}

function CreateBroadcast({ onClose, onDone }) {
  const cfg = useWaConfig();
  const { types } = useClientTypes();
  const { items: contacts } = useCrmCollection("contacts");
  const [name, setName] = useState("");
  const [aud, setAud] = useState({ types: [], allContacts: false, stage: "", tagIds: [] });
  const [v, setV] = useState({ key: "", params: { header: [], body: [], buttons: {} }, file: null });
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (k, id) => setAud((a) => ({ ...a, [k]: a[k].includes(id) ? a[k].filter((x) => x !== id) : [...a[k], id] }));
  // Estimación (el servidor quita repetidos, BAJAS y números no válidos).
  const estimate = useMemo(() => contacts.filter((c) => !c.deleted && (c.phone || c.whatsapp) && (aud.allContacts || typesOf(c).some((t) => aud.types.includes(t)))).length, [contacts, aud]);
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const sendAt = when ? new Date(when).getTime() : 0;
      if (when && !(sendAt > Date.now())) throw new Error("La fecha programada ya ha pasado");
      const t = await templatePayload(v, toBase64);
      const r = await waApi("broadcasts/create", { name, template: { name: t.name, language: t.language }, params: t.params, ...(t.file ? { file: t.file } : {}), audience: aud, sendAt });
      onDone(r);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <CrmModal title="Nueva difusión de WhatsApp" onClose={onClose} maxWidth={900}
      footer={<><button className="crm-btn ghost" onClick={onClose}>Cancelar</button><button className="crm-btn" onClick={go} disabled={busy || !name.trim() || !v.key}>{busy ? "Preparando…" : when ? "Programar" : "Enviar ahora"}</button></>}>
      <div className="crm-field"><label>Nombre (solo para vosotros)</label><input value={name} placeholder="Curso IA RRSS · noviembre" onChange={(e) => setName(e.target.value)} /></div>
      <h4 className="wa-h4">1 · Destinatarios</h4>
      <label className="wa-check"><input type="checkbox" checked={aud.allContacts} onChange={(e) => setAud({ ...aud, allContacts: e.target.checked })} /> Todos los contactos del CRM con teléfono</label>
      {!aud.allContacts && <>
        <small className="wa-hint">Por tipo / lista de contactos:</small>
        <div className="wa-chips">{types.map((t) => <button key={t.id} className={`wa-chip ${aud.types.includes(t.id) ? "on" : ""}`} onClick={() => toggle("types", t.id)}>{t.icon} {t.label}</button>)}</div>
      </>}
      {cfg && <div className="crm-two" style={{ marginTop: 10 }}>
        <div className="crm-field"><label>…y/o los chats de una columna</label>
          <select value={aud.stage} onChange={(e) => setAud({ ...aud, stage: e.target.value })}>
            <option value="">—</option>
            {cfg.funnels.map((f) => <optgroup key={f.id} label={f.name}>{f.stages.map((s) => <option key={s.id} value={`${f.id}:${s.id}`}>{s.name}</option>)}</optgroup>)}
          </select></div>
        <div className="crm-field"><label>…y/o los chats con etiqueta</label>
          <div className="wa-chips">{cfg.tags.length ? cfg.tags.map((t) => <button key={t.id} className={`wa-chip ${aud.tagIds.includes(t.id) ? "on" : ""}`} onClick={() => toggle("tagIds", t.id)}>{t.name}</button>) : <small className="wa-hint">Sin etiquetas</small>}</div></div>
      </div>}
      <p className="wa-hint">Contactos del CRM seleccionados con teléfono: <b>{estimate}</b>{aud.stage || aud.tagIds.length ? " + los chats elegidos" : ""}. Se quitan los repetidos y quienes pidieron la BAJA.</p>
      <h4 className="wa-h4">2 · Mensaje</h4>
      <TemplateFields value={v} onChange={setV} showContactVars />
      <h4 className="wa-h4">3 · Cuándo</h4>
      <div className="crm-field" style={{ maxWidth: 280 }}><label>Programar (vacío = ahora)</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
      {err && <p className="wa-err">{err}</p>}
      <p className="wa-hint">Meta cobra cada conversación de marketing/utilidad según su tarifa y limita los envíos diarios según la calidad del número. Envía solo a quien os haya dado su permiso.</p>
    </CrmModal>
  );
}
