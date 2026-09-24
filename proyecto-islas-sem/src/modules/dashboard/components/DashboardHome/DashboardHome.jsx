import "./DashboardHome.styles.css";
import { Link } from "react-router-dom";
import { useState } from "react";
import CallReservationModal from "../modals/CallReservationModal";

export default function DashboardHome() {
  const [showCallModal, setShowCallModal] = useState(false);

  return (
    <div className="DashboardHome">
      {/* CABECERA DE BIENVENIDA */}
      <h1 className="DashboardHome__title">Hola de nuevo 👋</h1>
      <p className="DashboardHome__subtitle">
        Este es el estado de tu cuenta hoy.
      </p>

      {/* FILA DE ESTADÍSTICAS RÁPIDAS */}
      <div className="DashboardHome__stats">
        <div className="DashboardHome__statTile">
          <span className="DashboardHome__statLabel">Plan actual</span>
          <span className="DashboardHome__statValue">Gratuito</span>
        </div>
        <div className="DashboardHome__statTile">
          <span className="DashboardHome__statLabel">Suscriptores</span>
          <span className="DashboardHome__statValue">0</span>
        </div>
        <div className="DashboardHome__statTile">
          <span className="DashboardHome__statLabel">Campañas enviadas</span>
          <span className="DashboardHome__statValue">0</span>
        </div>
      </div>

      {/* TARJETA PRINCIPAL DE ACCIÓN */}
      <div className="DashboardHome__mainCard">
        <img
          src="/assets/dashboard/campaign.png"
          alt="Campaña"
          className="DashboardHome__mainCardImage"
        />
        <div className="DashboardHome__mainCardBody">
          <h3 className="DashboardHome__cardTitle">
            Manda tu primer envío
          </h3>
          <p className="DashboardHome__cardText">
            En unos pocos pasos tienes tu campaña lista para salir.
          </p>
          <Link
            to="/dashboard/campaigns/create"
            className="DashboardHome__button"
          >
            Crear campaña
          </Link>
        </div>
      </div>

      {/* ENLACE SECUNDARIO DE AYUDA */}
      <button
        className="DashboardHome__helpLink"
        onClick={() => setShowCallModal(true)}
      >
        ¿Prefieres que te acompañemos? Reserva una llamada con el equipo →
      </button>

      {/* MODAL */}
      {showCallModal && <CallReservationModal onClose={() => setShowCallModal(false)} />}
    </div>
  );
}
