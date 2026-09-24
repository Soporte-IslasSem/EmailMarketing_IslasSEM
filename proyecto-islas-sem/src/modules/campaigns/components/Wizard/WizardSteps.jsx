import { Link, useLocation } from "react-router-dom";
import "./WizardSteps.styles.css";

export default function WizardSteps() {
  const { pathname } = useLocation();

  const steps = [
    { label: "Configuración", path: "/dashboard/campaigns/create/config" },
    { label: "Listas", path: "/dashboard/campaigns/create/lists" },
    { label: "Plantillas", path: "/dashboard/campaigns/create/templates" },
    { label: "Diseño", path: "/dashboard/campaigns/create/design" },
    { label: "Envío", path: "/dashboard/campaigns/create/send" },
  ];

  return (
    <div className="WizardSteps">
      {steps.map((step, index) => {
        const isActive = pathname === step.path;
        return (
          <div
            key={index}
            className={`WizardSteps__step ${isActive ? "active" : ""}`}
          >
            <Link to={step.path}>{step.label}</Link>
          </div>
        );
      })}
    </div>
  );
}
