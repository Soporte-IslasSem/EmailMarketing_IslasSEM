import "./Header.styles.css";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../../shared/hooks/useAuth.jsx";
import { crumbOf } from "../../../../shared/nav.js";

export default function Header() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <header className="DashboardHeader">
      <div className="DashboardHeader__left">
        <h2 className="DashboardHeader__breadcrumb">{crumbOf(location.pathname)}</h2>
      </div>

      <div className="DashboardHeader__right">
        <span className="DashboardHeader__user">{user?.email}</span>
      </div>
    </header>
  );
}
