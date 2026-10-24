import { useMemo, useState } from "react";
import { usePerms } from "../../crm/lib/permissions";
import CrmModal from "../../crm/components/CrmModal";
import { toBase64 } from "../../contracts/lib/api";
import { waApi, useWaCollection, comp, varsOf, renderTemplate, TPL_STATUS, CATEGORY, LANGS, dateTime } from "../lib/api";
import "../../crm/crm.styles.css";
import "../whatsapp.css";

// Plantillas de Meta: las que hay en la cuenta de WhatsApp Business (se sincronizan solas cada
// 5 min y al momento cuando Meta las aprueba o rechaza), crear nuevas y borrarlas.
export default function Templates() {
  const perms = usePerms();
  const items = useWaCollection("waTemplates");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState(null);
  const [term, setTerm] = useState("");
  const list = useMemo(() => (items || []).filter((t) => !term || `${t.name} ${comp(t, "BODY")?.text}`.toLowerCase().includes(term.toLowerCase()))
    .sort((a, b) => (a.status === "APPROVED" ? 0 : 1) - (b.status === "APPROVED" ? 0 : 1) || a.name.localeCompare(b.name)), [items, term]);

  const sync = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await waApi("templates/sync", {});
      setMsg({ text: r.skipped ? `No se pudo sincronizar: ${r.skipped}` : `Sincronizadas: ${r.total} plantilla${r.total === 1 ? "" : "s"}.` });
    } catch (e) { setMsg({ err: true, text: e.message }); }
    setBusy(false);
  };
  const remove = async (t) => {
    if (!window.confirm(`¿Borrar la plantilla «${t.name}» (${t.language}) en Meta? No se puede deshacer y el nombre no se podrá reutilizar durante 30 días.`)) return;
    try { await waApi("templates/delete", { id: t.id }); setView(null); } catch (e) { setMsg({ err: true, text: e.message }); }
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div><h1 style={{ margin: 0 }}>Plantillas de Meta</h1>
          <p>Mensajes aprobados por Meta para escribir fuera de la ventana de 24 h, iniciar conversaciones y hacer difusiones. La revisión tarda de unos minutos a unas horas.</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="crm-btn ghost" onClick={sync} disabled={busy}>{busy ? "Sincronizando…" : "↻ Sincronizar"}</button>
          {perms.isAdmin && <button className="crm-btn" onClick={() => setCreating(true)}>+ Crear plantilla</button>}
        </div>
      </div>
      {msg && <p className={msg.err ? "wa-err" : "wa-ok"}>{msg.text}</p>}
      <input className="crm-search" placeholder="Buscar plantilla…" value={term} onChange={(e) => setTerm(e.target.value)} />
      {items === null ? <p>Cargando…</p> : !list.length ? (
        <div className="wa-card"><p className="wa-hint" style={{ margin: 0 }}>{items.length ? "Ninguna coincide." : "Aún no hay plantillas. Conecta WhatsApp en Ajustes (con el WABA ID) y pulsa «Sincronizar», o crea una nueva."}</p></div>
      ) : (
        <table className="crm-table wa-tpltable">
          <thead><tr><th>Estado</th><th>Nombre</th><th>Idioma</th><th>Categoría</th><th>Texto</th><th /></tr></thead>
          <tbody>
            {list.map((t) => {
              const [label, cls] = TPL_STATUS[t.status] || [t.status, "wait"];
              return (
                <tr key={t.id} onClick={() => setView(t)} style={{ cursor: "pointer" }}>
                  <td><span className={`wa-st-pill ${cls}`}>{label}</span>{t.quality && t.quality !== "UNKNOWN" && <small className="wa-hint"> · calidad {t.quality}</small>}</td>
                  <td><b>{t.name}</b></td>
                  <td>{t.language}</td>
                  <td>{CATEGORY[t.category] || t.category}</td>
                  <td className="wa-tpltext">{comp(t, "HEADER")?.format && comp(t, "HEADER").format !== "TEXT" && <span className="wa-tag">{comp(t, "HEADER").format}</span>} {comp(t, "BODY")?.text}</td>
                  <td>{(comp(t, "BUTTONS")?.buttons || []).some((b) => b.type === "FLOW") && <span className="wa-tag">Formulario</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {view && (
        <CrmModal title={`${view.name} · ${view.language}`} onClose={() => setView(null)} maxWidth={560}
          footer={<>{perms.isAdmin && <button className="crm-btn danger" onClick={() => remove(view)}>Borrar en Meta</button>}<button className="crm-btn ghost" onClick={() => setView(null)}>Cerrar</button></>}>
          <p><span className={`wa-st-pill ${(TPL_STATUS[view.status] || [])[1] || "wait"}`}>{(TPL_STATUS[view.status] || [view.status])[0]}</span> · {CATEGORY[view.category] || view.category}{view.syncedAt ? ` · sincronizada ${dateTime(view.syncedAt)}` : ""}</p>
          {view.rejectedReason && <p className="wa-err">Motivo de Meta: {view.rejectedReason}</p>}
          <Preview t={view} />
        </CrmModal>
      )}
      {creating && <CreateTemplate onClose={() => setCreating(false)} onDone={(s) => { setCreating(false); setMsg({ text: `Plantilla enviada a revisión de Meta (estado: ${s}). Te aparecerá como «Aprobada» cuando Meta la acepte.` }); }} />}
    </div>
  );
}

function Preview({ t, params }) {
  const p = renderTemplate(t, params);
  return (
    <div className="wa-tplf__preview" style={{ margin: 0 }}>
      <div className="wa-bubble out wa-bubble--preview">
        {p.header && <div className="wa-tpl-h">{p.header}</div>}
        <div className="wa-text">{p.body || "…"}</div>
        {p.footer && <div className="wa-tpl-f">{p.footer}</div>}
        {p.buttons.map((b, i) => <div key={i} className="wa-tpl-btn">{b}</div>)}
      </div>
    </div>
  );
}

const BTN_TYPES = [["QUICK_REPLY", "Respuesta rápida"], ["URL", "Ir a la web"], ["PHONE_NUMBER", "Llamar"]];

function CreateTemplate({ onClose, onDone }) {
  const [f, setF] = useState({ name: "", category: "MARKETING", language: "es", header: { format: "NONE", text: "", example: "", file: null }, body: "", examples: [], footer: "", buttons: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const vars = varsOf(f.body);
  const addVar = () => set({ body: `${f.body}{{${vars.length + 1}}}` });
  const setBtn = (i, patch) => set({ buttons: f.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const fake = {
    components: [
      ...(f.header.format === "TEXT" ? [{ type: "HEADER", format: "TEXT", text: f.header.text }] : f.header.format !== "NONE" ? [{ type: "HEADER", format: f.header.format }] : []),
      { type: "BODY", text: f.body }, ...(f.footer ? [{ type: "FOOTER", text: f.footer }] : []), ...(f.buttons.length ? [{ type: "BUTTONS", buttons: f.buttons }] : []),
    ],
  };
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const h = f.header;
      if (h.file && h.file.size > 16 * 1024 * 1024) throw new Error("El archivo pasa de 16 MB");
      const header = h.format === "TEXT" ? { format: "TEXT", text: h.text, example: h.example }
        : h.format !== "NONE" ? { format: h.format, file: h.file ? { name: h.file.name, mime: h.file.type, data: await toBase64(h.file) } : null } : null;
      if (header && header.format !== "TEXT" && !header.file) throw new Error("Adjunta un archivo de ejemplo para la cabecera");
      const r = await waApi("templates/create", { name: f.name, category: f.category, language: f.language, header, body: { text: f.body, examples: f.examples }, footer: f.footer, buttons: f.buttons });
      onDone(r.status);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <CrmModal title="Crear plantilla de WhatsApp" onClose={onClose} maxWidth={940}
      footer={<><button className="crm-btn ghost" onClick={onClose}>Cancelar</button><button className="crm-btn" onClick={go} disabled={busy || !f.name || !f.body}>{busy ? "Enviando a Meta…" : "Enviar a revisión"}</button></>}>
      <div className="wa-tplf">
        <div className="wa-tplf__form">
          <div className="crm-two">
            <div className="crm-field"><label>Nombre (minúsculas y _)</label>
              <input value={f.name} placeholder="bienvenida_curso" onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") })} /></div>
            <div className="crm-field"><label>Idioma</label>
              <select value={f.language} onChange={(e) => set({ language: e.target.value })}>{LANGS.map(([k, l]) => <option key={k} value={k}>{l} ({k})</option>)}</select></div>
          </div>
          <div className="crm-field"><label>Categoría</label>
            <select value={f.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="MARKETING">Marketing — promociones, novedades, invitaciones</option>
              <option value="UTILITY">Utilidad — confirmaciones, recordatorios, avisos de una gestión</option>
            </select></div>

          <div className="crm-field"><label>Cabecera (opcional)</label>
            <select value={f.header.format} onChange={(e) => set({ header: { ...f.header, format: e.target.value } })}>
              <option value="NONE">Sin cabecera</option><option value="TEXT">Texto</option><option value="IMAGE">Imagen</option><option value="VIDEO">Vídeo</option><option value="DOCUMENT">Documento PDF</option>
            </select></div>
          {f.header.format === "TEXT" && <div className="crm-two">
            <div className="crm-field"><label>Texto de la cabecera (máx. 60)</label><input maxLength={60} value={f.header.text} onChange={(e) => set({ header: { ...f.header, text: e.target.value } })} /></div>
            {varsOf(f.header.text).length > 0 && <div className="crm-field"><label>Ejemplo de {"{{1}}"}</label><input value={f.header.example} onChange={(e) => set({ header: { ...f.header, example: e.target.value } })} /></div>}
          </div>}
          {["IMAGE", "VIDEO", "DOCUMENT"].includes(f.header.format) && (
            <div className="crm-field"><label>Archivo de ejemplo (Meta lo usa para revisar; al enviar pondrás el real)</label>
              <input type="file" accept={{ IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" }[f.header.format]} onChange={(e) => set({ header: { ...f.header, file: e.target.files?.[0] || null } })} /></div>
          )}

          <div className="crm-field"><label>Mensaje (máx. 1024) · *negrita* _cursiva_ ~tachado~</label>
            <textarea rows={6} maxLength={1024} value={f.body} onChange={(e) => set({ body: e.target.value })} placeholder="Hola {{1}}, gracias por tu interés en {{2}}. ¿Te llamamos esta semana?" />
            <div><button className="crm-btn ghost sm" type="button" onClick={addVar}>+ Añadir variable</button> <small className="wa-hint">{f.body.length}/1024</small></div>
          </div>
          {vars.map((k, i) => (
            <div className="crm-field" key={k}><label>Ejemplo para {`{{${k}}}`}</label>
              <input value={f.examples[i] || ""} placeholder={i === 0 ? "María" : ""} onChange={(e) => set({ examples: Object.assign([...f.examples], { [i]: e.target.value }) })} /></div>
          ))}

          <div className="crm-field"><label>Pie (opcional, máx. 60)</label><input maxLength={60} value={f.footer} placeholder="ISLAS SEM · Responde BAJA para no recibir más" onChange={(e) => set({ footer: e.target.value })} /></div>

          <div className="crm-field"><label>Botones (opcional, hasta 10)</label>
            {f.buttons.map((b, i) => (
              <div key={i} className="wa-btnrow">
                <select value={b.type} onChange={(e) => setBtn(i, { type: e.target.value })}>{BTN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <input maxLength={25} placeholder="Texto del botón" value={b.text} onChange={(e) => setBtn(i, { text: e.target.value })} />
                {b.type === "URL" && <input placeholder="https://islassem.com/… (puede acabar en {{1}})" value={b.url || ""} onChange={(e) => setBtn(i, { url: e.target.value })} />}
                {b.type === "URL" && /\{\{1\}\}$/.test(b.url || "") && <input placeholder="Ejemplo de dirección completa" value={b.example || ""} onChange={(e) => setBtn(i, { example: e.target.value })} />}
                {b.type === "PHONE_NUMBER" && <input placeholder="+34 928 000 000" value={b.phone || ""} onChange={(e) => setBtn(i, { phone: e.target.value })} />}
                <button className="wa-icon" onClick={() => set({ buttons: f.buttons.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            {f.buttons.length < 10 && <div><button className="crm-btn ghost sm" type="button" onClick={() => set({ buttons: [...f.buttons, { type: "QUICK_REPLY", text: "" }] })}>+ Añadir botón</button></div>}
          </div>
          {err && <p className="wa-err">{err}</p>}
          <p className="wa-hint">Consejos para que Meta la apruebe: no empieces ni acabes el mensaje con una variable, pon ejemplos realistas, y en marketing ofrece cómo darse de baja.</p>
        </div>
        <div className="wa-tplf__preview"><Preview t={fake} params={{ header: [f.header.example], body: f.examples }} /></div>
      </div>
    </CrmModal>
  );
}
