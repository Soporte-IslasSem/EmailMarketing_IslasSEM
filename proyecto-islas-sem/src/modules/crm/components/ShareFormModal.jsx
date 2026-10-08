// Compartir / insertar un formulario del CRM: enlace directo e <iframe> para cualquier web.
import { useState } from "react";
import CrmModal from "./CrmModal";
import "../pages/crmforms.styles.css";

export default function ShareFormModal({ formId, title, listName, onClose }) {
  const [copied, setCopied] = useState("");
  const base = typeof window !== "undefined" ? window.location.origin : "https://email-marketing.islassem.com";
  const url = `${base}/f/${formId}`;
  const iframe = `<iframe src="${url}" style="width:100%;max-width:640px;height:900px;border:0" loading="lazy" title="Formulario ISLAS SEM"></iframe>`;
  const copy = async (k, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(""), 1500); }
    catch { window.prompt("Copia:", text); }
  };
  return (
    <CrmModal title={title || "Compartir / insertar"} onClose={onClose} maxWidth={640}
      footer={<button className="crm-btn" onClick={onClose}>Ir a formularios</button>}>
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
        <label>Código para insertar en una web (&lt;iframe&gt;)</label>
        <div className="cf-embed">{iframe}</div>
        <button className="crm-btn ghost sm" style={{ marginTop: 6 }} onClick={() => copy("iframe", iframe)}>{copied === "iframe" ? "¡Copiado!" : "Copiar código"}</button>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: "#6b7d7d" }}>
        Para enviárselo a un cliente concreto desde una negociación, usa <code>{url}/&lt;id de la negociación&gt;</code> o la regla
        "Enviar formulario" de la etapa: así la respuesta queda en esa negociación.
      </p>
    </CrmModal>
  );
}
