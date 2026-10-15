import { Link, useNavigate, useLocation } from "react-router-dom";
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

        {/* BOTONES */}
        <div className="Header__actions">
          <Link to="/auth/login" className="Header__login">Entrar</Link>
          <Link to="/auth/register" className="Header__register">Regístrate</Link>
        </div>

      </div>
    </header>
  );
}
