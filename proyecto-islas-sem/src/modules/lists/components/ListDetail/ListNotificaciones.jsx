import { NavLink, Outlet } from "react-router-dom";
import "./ListNotificaciones.styles.css";

export default function ListNotificaciones() {
  return (
    <div className="ListNotificaciones">

      {/* SUBMENÚ INTERNO */}
      <div className="ListNotificaciones__subnav">
        <NavLink end to="">Ajustes generales</NavLink>
        <NavLink to="confirm-email">Email de confirmación</NavLink>
        <NavLink to="confirm-page">Página de confirmación</NavLink>
        <NavLink to="unsubscribe">Página de baja</NavLink>
      </div>

      {/* CONTENIDO DE CADA SUBPÁGINA */}
      <div className="ListNotificaciones__content">
        <Outlet />
      </div>
    </div>
  );
}
