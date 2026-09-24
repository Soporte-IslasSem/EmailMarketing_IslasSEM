import "./Header.styles.css";
import { useState } from "react";
import { useAuth } from "../../../../shared/hooks/useAuth.jsx";
import PlansModal from "../modals/PlansModal";

export default function Header() {
  const { user } = useAuth();
  const [showPlans, setShowPlans] = useState(false);

  return (
    <header className="DashboardHeader">
      <div className="DashboardHeader__left">
        {/* Breadcrumb eliminado */}
        <h2 className="DashboardHeader__breadcrumb"></h2>
      </div>

      <div className="DashboardHeader__right">
        <button
          className="DashboardHeader__upgrade"
          onClick={() => setShowPlans(true)}
        >
          Mejorar plan
        </button>
        <span className="DashboardHeader__user">{user?.email}</span>
      </div>

      {showPlans && <PlansModal onClose={() => setShowPlans(false)} />}
    </header>
  );
}
