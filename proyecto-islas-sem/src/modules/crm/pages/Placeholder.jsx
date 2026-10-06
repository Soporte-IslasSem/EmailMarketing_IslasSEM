import "../crm.styles.css";

// Página temporal para pestañas cuyo módulo aún se está portando del prototipo.
export default function Placeholder({ title, note }) {
  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>{title}</h1>
          <p>{note || "Módulo en construcción — se portará del prototipo (islas-sem-demo) en las próximas tandas."}</p>
        </div>
      </div>
      <div className="crm-panel" style={{ textAlign: "center", padding: "48px 20px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
        <p style={{ color: "var(--crm-muted)", margin: 0 }}>
          Esta sección tendrá el mismo diseño y funciones que en el prototipo.
        </p>
      </div>
    </div>
  );
}
