// Administración › Integraciones: punto de entrada a las integraciones que funcionan de
// verdad (importar/exportar datos, formularios en la web, webhooks, Google Calendar).
import { useNavigate } from "react-router-dom";
import "../crm.styles.css";

const CARDS = [
  {
    icon: "⬆", title: "Importar datos (CSV / Excel)",
    text: "Sube contactos, prospectos o productos desde un archivo. Se revisa antes de importar y no se duplican los emails que ya existen.",
    links: [["Importar contactos", "/dashboard/crm/contacts?import=1"], ["Importar prospectos", "/dashboard/crm/leads?import=1"], ["Importar productos", "/dashboard/crm/products"]],
  },
  {
    icon: "⬇", title: "Exportar a Excel (CSV)",
    text: "Contactos, empresas, prospectos, negociaciones y productos tienen el botón «⬇ Exportar» (según el permiso de tu rol).",
    links: [["Contactos", "/dashboard/crm/contacts"], ["Empresas", "/dashboard/crm/companies"], ["Negociaciones", "/dashboard/crm/pipeline"]],
  },
  {
    icon: "🧩", title: "Formularios en tu web",
    text: "Cada formulario tiene «Compartir»: enlace directo, código para incrustarlo, ventana emergente, barra o aviso al salir. Lo que se rellena entra solo al CRM y, si quieres, a una lista.",
    links: [["Ir a Formularios", "/dashboard/crm/forms"]],
  },
  {
    icon: "🔔", title: "Webhooks de listas",
    text: "Avisa a otro sistema (ERP, Zapier, Make…) cuando alguien se suscribe, se da de baja o rebota. Envío firmado con HMAC. Se configura en cada lista › Herramientas.",
    links: [["Ir a Listas", "/dashboard/lists"]],
  },
  {
    icon: "📅", title: "Google Calendar",
    text: "El calendario de la empresa y el de cada trabajador: las citas llegan como tareas y las tareas con hora se publican en el calendario de la persona asignada.",
    links: [["Ir a Tareas", "/dashboard/tasks"]],
  },
  {
    icon: "✉️", title: "Correo",
    text: "Los envíos (campañas, formularios, avisos) salen por el correo del hosting de ISLAS SEM y las respuestas se leen solas por IMAP para avanzar las negociaciones.",
    links: [["Bandeja de salida", "/dashboard/crm/outbox"]],
  },
];

export default function Integrations() {
  const navigate = useNavigate();
  return (
    <div className="crm">
      <div className="crm__top">
        <div><h1>Integraciones</h1><p>Conecta el CRM con tus archivos, tu web y tus herramientas.</p></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        {CARDS.map((c) => (
          <div key={c.title} className="crm-panel" style={{ margin: 0 }}>
            <h4 style={{ marginTop: 0 }}>{c.icon} {c.title}</h4>
            <p style={{ fontSize: 13, color: "var(--crm-muted)", marginBottom: 12 }}>{c.text}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {c.links.map(([label, to]) => <button key={to} className="crm-btn ghost sm" onClick={() => navigate(to)}>{label}</button>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
