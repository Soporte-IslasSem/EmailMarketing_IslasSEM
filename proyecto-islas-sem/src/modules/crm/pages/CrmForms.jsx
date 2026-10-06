import { useMemo, useState } from "react";
import { useCrmCollection } from "../lib/crm";
import "../crm.styles.css";

// Los dos formularios públicos replicados del Bitrix de ISLAS SEM.
const FORMS = [
  { type: "juridicos", name: "Solicitud Datos Jurídicos – Representante Legal", list: "Leads formulario web" },
  { type: "sepa", name: "Orden de Domiciliación SEPA", list: "Clientes activos" },
];

export default function CrmForms() {
  const { items: subs } = useCrmCollection("formSubmissions");
  const [copied, setCopied] = useState("");

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const counts = useMemo(() => {
    const c = {};
    subs.forEach((s) => { c[s.formType] = (c[s.formType] || 0) + 1; });
    return c;
  }, [subs]);

  const linkFor = (type) => `${base}/f/${type}`;
  const copy = async (type) => {
    try { await navigator.clipboard.writeText(linkFor(type)); setCopied(type); setTimeout(() => setCopied(""), 1500); }
    catch { window.prompt("Copia el enlace:", linkFor(type)); }
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Formularios</h1>
          <p>Formularios públicos rellenables · se envían al cliente y vuelven a su ficha.</p>
        </div>
      </div>

      <table className="crm-table">
        <thead>
          <tr><th>Nombre</th><th>Estado</th><th>Respuestas</th><th>Recorrido del cliente</th><th>Enlace</th></tr>
        </thead>
        <tbody>
          {FORMS.map((f) => (
            <tr key={f.type}>
              <td><b>{f.name}</b></td>
              <td><span className="crm-chip ok">Publicado</span></td>
              <td style={{ fontVariant: "tabular-nums" }}>{counts[f.type] || 0}</td>
              <td>{f.list}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <a className="crm-btn ghost sm" href={linkFor(f.type)} target="_blank" rel="noreferrer">Ver / Rellenar</a>{" "}
                <button className="crm-btn sm" onClick={() => copy(f.type)}>{copied === f.type ? "¡Copiado!" : "Copiar enlace"}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="crm-panel" style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--crm-muted)" }}>
          💡 El enlace de cada formulario se envía <b>solo</b> cuando una negociación entra en su etapa
          (p. ej. al pasar a <b>SEPA</b>). También puedes copiarlo y enviarlo a mano. Las respuestas quedan
          registradas en la <b>ficha del contacto y de la negociación</b>.
        </p>
      </div>
    </div>
  );
}
