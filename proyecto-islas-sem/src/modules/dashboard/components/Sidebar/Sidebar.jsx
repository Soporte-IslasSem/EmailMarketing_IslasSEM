import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../../shared/hooks/useAuth.jsx";
import "./Sidebar.styles.css";

/* Importación directa de íconos desde src/assets/icons/sidebar */
import homeIcon from "../../../../assets/icons/sidebar/home.svg";
import sendIcon from "../../../../assets/icons/sidebar/send.svg";
import listIcon from "../../../../assets/icons/sidebar/list.svg";
import templateIcon from "../../../../assets/icons/sidebar/template.svg";
import automationIcon from "../../../../assets/icons/sidebar/automation.svg";
import reportsIcon from "../../../../assets/icons/sidebar/reports.svg";

export default function Sidebar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/auth/login");
  };

  const isActive = (path) => location.pathname === path;

  return (
    <aside className="Sidebar">
      <div className="Sidebar__top">
        {/* LOGO */}
        <div className="Sidebar__logoWrapper">
          <img
            src="/islas-sem-logo.png"
            alt="Islas SEM"
            className="Sidebar__logo"
          />
        </div>

        {/* NAV */}
        <nav className="Sidebar__nav">
          <Link
            to="/dashboard"
            className={`Sidebar__link ${isActive("/dashboard") ? "active" : ""}`}
          >
            <img src={homeIcon} alt="" />
            <span>Inicio</span>
          </Link>

          <p className="Sidebar__sectionTitle">Envíos</p>

          <Link
            to="/dashboard/campaigns"
            className={`Sidebar__link ${isActive("/dashboard/campaigns") ? "active" : ""}`}
          >
            <img src={sendIcon} alt="" />
            <span>Campañas</span>
          </Link>

          <Link
            to="/dashboard/automations"
            className={`Sidebar__link ${isActive("/dashboard/automations") ? "active" : ""}`}
          >
            <img src={automationIcon} alt="" />
            <span>Automatizaciones</span>
          </Link>

          <p className="Sidebar__sectionTitle">Gestión</p>

          <Link
            to="/dashboard/lists"
            className={`Sidebar__link ${isActive("/dashboard/lists") ? "active" : ""}`}
          >
            <img src={listIcon} alt="" />
            <span>Listas</span>
          </Link>

          <Link
            to="/dashboard/templates"
            className={`Sidebar__link ${isActive("/dashboard/templates") ? "active" : ""}`}
          >
            <img src={templateIcon} alt="" />
            <span>Plantillas</span>
          </Link>

          <Link
            to="/dashboard/reports"
            className={`Sidebar__link ${isActive("/dashboard/reports") ? "active" : ""}`}
          >
            <img src={reportsIcon} alt="" />
            <span>Informes</span>
          </Link>
        </nav>
      </div>

      {/* USER + LOGOUT */}
      <div className="Sidebar__bottom">
        {user && (
          <div className="Sidebar__user">
            <span>{user.email}</span>
          </div>
        )}

        <button className="Sidebar__logoutButton" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
