import { Link, useNavigate, useLocation } from "react-router-dom";
import RecursosDropdown from "./RecursosDropdown.jsx";
import "./Header.styles.css";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogoClick = () => {
    // Si NO estás en el dashboard → volver al home
    if (!location.pathname.startsWith("/dashboard")) {
      navigate("/");
    }
  };

  return (
    <header className="Header">
      <div className="Header__container">

        {/* LOGO */}
        <div className="Header__logoWrapper" onClick={handleLogoClick}>
          <img
            src="/islas-sem-logo.png"
            alt="Islas SEM"
            className="Header__logo"
          />
        </div>

        {/* NAV */}
        <nav className="Header__nav">
          <Link to="/servicios" className="Header__link">Plataforma</Link>
          <Link to="/tarifas" className="Header__link">Precios</Link>

          {/* APRENDE CON DROPDOWN PREMIUM */}
          <div className="Header__recursosWrapper">
            <span className="Header__link">Aprende</span>
            <RecursosDropdown />
          </div>

          <Link to="/herramientas-gratuitas" className="Header__link">Herramientas</Link>
          <Link to="/integraciones" className="Header__link">Integraciones</Link>
          <Link to="/soporte" className="Header__link">Ayuda</Link>
        </nav>

        {/* BOTONES */}
        <div className="Header__actions">
          <Link to="/auth/login" className="Header__login">Entrar</Link>
          <Link to="/auth/register" className="Header__register">Regístrate</Link>
        </div>

      </div>
    </header>
  );
}
