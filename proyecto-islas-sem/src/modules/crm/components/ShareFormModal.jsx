// Compartir / insertar un formulario: enlace directo y código para cualquier web, en el
// modo que se elija (incrustado, popup, barra inferior o exit intent).
import { useState } from "react";
import CrmModal from "./CrmModal";
import { EMBED_MODES, buildFormEmbed } from "../lib/formEmbed";
import "../pages/crmforms.styles.css";

export default function ShareFormModal({ formId, title, listName, onClose, closeLabel = "Cerrar" }) {
  const [copied, setCopied] = useState("");
  const [mode, setMode] = useState("inline");
  const [delaySeconds, setDelay] = useState(5);
  const [hideDays, setHideDays] = useState(7);
  const base = typeof window !== "undefined" ? window.location.origin : "https://email-marketing.islassem.com";
  const url = `${base}/f/${formId}`;
  const code = buildFormEmbed(base, formId, mode, { delaySeconds, hideDays });
  const copy = async (k, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(""), 1500); }
    catch { window.prompt("Copia:", text); }
  };
  return (
    <CrmModal title={title || "Compartir / insertar"} onClose={onClose} maxWidth={680}
      footer={<button className="crm-btn" onClick={onClose}>{closeLabel}</button>}>
      <p style={{ margin: "0 0 12px", color: "#5b6b6a", fontSize: 14 }}>
        Comparte el enlace o pega el código en cualquier web (WordPress, Wix, HTML…). Cada envío entra <b>solo</b> en el
        CRM{listName ? <> y en la lista <b>{listName}</b></> : null}, sin imputar datos a mano.
      </p>
      <div className="crm-field">
        <label>Enlace directo</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={url} readOnly onFocus={(e) => e.target.select()} />
          <button className="crm-btn ghost sm" onClick={() => copy("url", url)}>{copied === "url" ? "¡Copiado!" : "Copiar"}</button>
          <a className="crm-btn ghost sm" href={url} target="_blank" rel="noreferrer">Abrir</a>
        </div>
      </div>
      <div className="crm-field">
        <label>¿Cómo se muestra en tu web?</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {EMBED_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {mode !== "inline" && (
        <div className="cf-two">
          {mode === "popup" && (
            <div className="crm-field"><label>Aparece a los (segundos)</label><input type="number" min="0" max="120" value={delaySeconds} onChange={(e) => setDelay(e.target.value)} /></div>
          )}
          <div className="crm-field"><label>Si lo cierran, no volver a mostrar en (días)</label><input type="number" min="0" max="365" value={hideDays} onChange={(e) => setHideDays(e.target.value)} /></div>
        </div>
      )}
      <div className="crm-field">
        <label>{mode === "inline" ? "Código para pegar donde quieras que salga" : "Código para pegar antes de </body>"}</label>
        <div className="cf-embed" style={{ maxHeight: 220, overflow: "auto" }}>{code}</div>
        <button className="crm-btn ghost sm" style={{ marginTop: 6 }} onClick={() => copy("code", code)}>{copied === "code" ? "¡Copiado!" : "Copiar código"}</button>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: "#6b7d7d" }}>
        Para enviárselo a un cliente concreto desde una negociación, usa <code>{url}/&lt;id de la negociación&gt;</code> o la regla
        "Enviar formulario" de la etapa: así la respuesta queda en esa negociación.
      </p>
    </CrmModal>
  );
}
