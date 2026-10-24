import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useWaCollection, varsOf, comp, renderTemplate, CATEGORY, CONTACT_VARS } from "../lib/api";

// Elegir una plantilla aprobada y rellenar sus variables (cabecera, mensaje, botones) y el
// archivo de cabecera si lo lleva. Vista previa al lado, como la verá el cliente.
// value = { key: "nombre__idioma", params: { header: [], body: [], buttons: {} }, file }
export default function TemplateFields({ value, onChange, showContactVars = false }) {
  const all = useWaCollection("waTemplates");
  const approved = useMemo(() => (all || []).filter((t) => t.status === "APPROVED").sort((a, b) => a.name.localeCompare(b.name)), [all]);
  const t = approved.find((x) => x.id === value.key) || null;
  const set = (patch) => onChange({ ...value, ...patch });
  const setParam = (part, i, v) => {
    const cur = value.params?.[part];
    const next = part === "buttons" ? { ...(cur || {}), [i]: v } : Object.assign([...(cur || [])], { [i]: v });
    set({ params: { ...value.params, [part]: next } });
  };

  if (all === null) return <p className="wa-hint">Cargando plantillas…</p>;
  if (!approved.length) {
    return <p className="wa-hint">No hay plantillas aprobadas por Meta. Créalas en <Link to="/dashboard/whatsapp/plantillas">WhatsApp › Plantillas</Link> (la revisión tarda de minutos a unas horas).</p>;
  }
  const h = comp(t, "HEADER");
  const hVars = h?.format === "TEXT" ? varsOf(h.text) : [];
  const bVars = varsOf(comp(t, "BODY")?.text);
  const urlButtons = (comp(t, "BUTTONS")?.buttons || []).map((b, i) => [b, i]).filter(([b]) => (b.type === "URL" && varsOf(b.url).length) || b.type === "COPY_CODE");
  const media = ["IMAGE", "VIDEO", "DOCUMENT"].includes(h?.format) ? h.format : "";
  const prev = t ? renderTemplate(t, value.params) : null;
  const accept = { IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" }[media];
  const exampleOf = (part, i) => {
    const ex = part === "body" ? comp(t, "BODY")?.example?.body_text?.[0]?.[i] || comp(t, "BODY")?.example?.body_text_named_params?.[i]?.example : comp(t, "HEADER")?.example?.header_text?.[0];
    return ex ? `p. ej. ${ex}` : "";
  };

  return (
    <div className="wa-tplf">
      <div className="wa-tplf__form">
        <div className="crm-field">
          <label>Plantilla</label>
          <select value={value.key || ""} onChange={(e) => {
            const x = approved.find((y) => y.id === e.target.value);
            onChange({ key: e.target.value, name: x?.name || "", language: x?.language || "", params: { header: [], body: [], buttons: {} }, file: null });
          }}>
            <option value="">Elige una plantilla aprobada…</option>
            {approved.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.language} · {CATEGORY[x.category] || x.category}</option>)}
          </select>
        </div>
        {t && <>
          {media && (
            <div className="crm-field">
              <label>Archivo de la cabecera ({{ IMAGE: "imagen JPG/PNG", VIDEO: "vídeo MP4", DOCUMENT: "PDF" }[media]})</label>
              <input type="file" accept={accept} onChange={(e) => set({ file: e.target.files?.[0] || null })} />
            </div>
          )}
          {hVars.map((k, i) => (
            <div className="crm-field" key={`h${k}`}>
              <label>Cabecera · {`{{${k}}}`}</label>
              <input value={value.params?.header?.[i] || ""} placeholder={exampleOf("header", i)} onChange={(e) => setParam("header", i, e.target.value)} />
            </div>
          ))}
          {bVars.map((k, i) => (
            <div className="crm-field" key={`b${k}`}>
              <label>Variable {`{{${k}}}`}</label>
              <input value={value.params?.body?.[i] || ""} placeholder={exampleOf("body", i)} onChange={(e) => setParam("body", i, e.target.value)} />
            </div>
          ))}
          {urlButtons.map(([b, i]) => (
            <div className="crm-field" key={`u${i}`}>
              <label>Botón «{b.text}» · {b.type === "COPY_CODE" ? "código" : `final de la dirección (${b.url.replace("{{1}}", "…")})`}</label>
              <input value={value.params?.buttons?.[i] || ""} onChange={(e) => setParam("buttons", i, e.target.value)} />
            </div>
          ))}
          {showContactVars && (bVars.length > 0 || hVars.length > 0) && (
            <p className="wa-hint">Puedes usar datos de cada contacto en los valores: {CONTACT_VARS.join(" ")}</p>
          )}
        </>}
      </div>
      {prev && (
        <div className="wa-tplf__preview">
          <div className="wa-bubble out wa-bubble--preview">
            {prev.header && <div className="wa-tpl-h">{prev.header}</div>}
            <div className="wa-text">{prev.body}</div>
            {prev.footer && <div className="wa-tpl-f">{prev.footer}</div>}
            {prev.buttons.map((b, i) => <div key={i} className="wa-tpl-btn">{b}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

