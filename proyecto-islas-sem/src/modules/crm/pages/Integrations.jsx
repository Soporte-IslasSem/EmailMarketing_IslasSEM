import { useState } from "react";
import "../crm.styles.css";

const ENDPOINTS = [
  ["GET", "/api/v1/leads", "Listar prospectos"],
  ["POST", "/api/v1/leads", "Crear prospecto"],
  ["GET", "/api/v1/contacts", "Listar contactos"],
  ["POST", "/api/v1/contacts", "Crear contacto"],
  ["GET", "/api/v1/deals", "Listar negociaciones"],
  ["POST", "/api/v1/deals", "Crear negociación"],
  ["GET", "/api/v1/products", "Listar productos"],
  ["POST", "/api/v1/webhooks", "Registrar webhook (eventos)"],
];

export default function Integrations() {
  const apiKey = "islassem_live_" + "•".repeat(24);
  const [copied, setCopied] = useState("");
  const embed = `<script src="https://email-marketing.islassem.com/embed/form.js" data-form="contacto"></script>`;
  const copy = (txt, id) => {
    try { navigator.clipboard.writeText(txt); setCopied(id); setTimeout(() => setCopied(""), 1500); } catch (_) {}
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div><h1>Integraciones / API</h1><p>Cruza los datos del CRM con tu ERP y otras herramientas.</p></div>
      </div>

      <div className="crm-panel">
        <h4 style={{ marginTop: 0 }}>Clave de API</h4>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code style={{ background: "#f4f7f7", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>{apiKey}</code>
          <button className="crm-btn ghost sm" onClick={() => copy("islassem_live_XXXXXXXXXXXXXXXXXXXXXXXX", "key")}>{copied === "key" ? "Copiado ✓" : "Copiar"}</button>
          <button className="crm-btn ghost sm" onClick={() => alert("Rotar clave (demo)")}>Rotar</button>
        </div>
        <p style={{ color: "var(--crm-muted)", fontSize: 13, marginBottom: 0 }}>Base URL: <b>https://email-marketing.islassem.com/api/v1</b></p>
      </div>

      <div className="crm-panel">
        <h4 style={{ marginTop: 0 }}>Endpoints</h4>
        <table className="crm-table">
          <thead><tr><th>Método</th><th>Ruta</th><th>Descripción</th></tr></thead>
          <tbody>
            {ENDPOINTS.map(([m, path, desc]) => (
              <tr key={path + m}>
                <td><span className={`crm-chip ${m === "GET" ? "info" : "ok"}`}>{m}</span></td>
                <td><code>{path}</code></td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div className="crm-panel">
          <h4 style={{ marginTop: 0 }}>Formulario embebido</h4>
          <p style={{ fontSize: 13, color: "var(--crm-muted)" }}>Pega este código en cualquier web y los leads entran solos al CRM:</p>
          <code style={{ display: "block", background: "#f4f7f7", padding: "10px 12px", borderRadius: 8, fontSize: 12, wordBreak: "break-all" }}>{embed}</code>
          <button className="crm-btn ghost sm" style={{ marginTop: 8 }} onClick={() => copy(embed, "embed")}>{copied === "embed" ? "Copiado ✓" : "Copiar código"}</button>
        </div>
        <div className="crm-panel">
          <h4 style={{ marginTop: 0 }}>Cruce con ERP</h4>
          <p style={{ fontSize: 13, color: "var(--crm-muted)", marginBottom: 12 }}>Sincroniza productos y clientes con tu ERP por CSV o API.</p>
          <button className="crm-btn ghost sm" onClick={() => alert("Sincronizar por API (demo)")}>Sincronizar por API</button>{" "}
          <button className="crm-btn ghost sm" onClick={() => alert("Importar por CSV (demo)")}>Importar por CSV</button>
        </div>
        <div className="crm-panel">
          <h4 style={{ marginTop: 0 }}>Correos de trabajo</h4>
          <p style={{ fontSize: 13, color: "var(--crm-muted)", marginBottom: 12 }}>Reduce gradualmente el uso de correos fuera del CRM.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="crm-chip info">comercio@islassem.com</span>
            <span className="crm-chip info">grupo@islassem.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}
