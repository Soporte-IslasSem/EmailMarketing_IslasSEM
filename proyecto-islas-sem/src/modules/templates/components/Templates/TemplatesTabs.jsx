// Cabecera común de la sección Plantillas: título + pestañas
// (Plantillas de ISLAS SEM · Mis plantillas · Etiquetas).
import { Link } from "react-router-dom";
import "./Templates.styles.css";

export default function TemplatesTabs({ active, mineCount, action = null }) {
  const tabs = [
    ["sistema", "Plantillas de ISLAS SEM", "/dashboard/templates?ver=sistema"],
    ["mis", `Mis plantillas${mineCount ? ` (${mineCount})` : ""}`, "/dashboard/templates?ver=mis"],
    ["etiquetas", "Etiquetas", "/dashboard/templates/tags"],
  ];
  return (
    <div className="TemplatesTabs">
      <div className="TemplatesTabs__top">
        <div>
          <h1>Plantillas</h1>
          <p>Desde aquí puedes crear, editar, duplicar o eliminar tus plantillas.</p>
        </div>
        {action}
      </div>
      <nav className="TemplatesTabs__nav">
        {tabs.map(([key, label, to]) => (
          <Link key={key} to={to} className={active === key ? "is-on" : ""}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}
