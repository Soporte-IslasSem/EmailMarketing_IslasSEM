import "./DashboardHome.styles.css";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";
import { useAuth } from "../../../../shared/hooks/useAuth";
import CallReservationModal from "../modals/CallReservationModal";
import { useCrmCollection } from "../../../crm/lib/crm";
import { reportMetrics } from "../../../reports/reportMetrics";

// Suscriptores activos e informes de campañas del usuario, en tiempo real.
function useEmailStats() {
  const { user } = useAuth();
  const [subs, setSubs] = useState([]);
  const [reports, setReports] = useState([]);
  useEffect(() => {
    if (!user) return undefined;
    const u1 = onSnapshot(query(collection(db, "subscribers"), where("userId", "==", user.uid)), (s) => setSubs(s.docs.map((d) => d.data())), () => setSubs([]));
    const u2 = onSnapshot(query(collection(db, "reports"), where("ownerId", "==", user.uid)), (s) => setReports(s.docs.map((d) => d.data())), () => setReports([]));
    return () => { u1(); u2(); };
  }, [user]);
  const active = subs.filter((s) => !["unsubscribed", "baja", "bounced", "rebotado", "blocked", "invalid", "pending"].includes(String(s.status || "").toLowerCase())).length;
  const totals = reports.map(reportMetrics).reduce((a, m) => ({ sent: a.sent + m.sent, opened: a.opened + m.opened, clicked: a.clicked + m.clicked }), { sent: 0, opened: 0, clicked: 0 });
  const rate = (n) => (totals.sent ? `${Math.round((n / totals.sent) * 1000) / 10}%` : "—");
  return { subscribers: active, campaigns: reports.length, openRate: rate(totals.opened), clickRate: rate(totals.clicked) };
}

export default function DashboardHome() {
  const [showCallModal, setShowCallModal] = useState(false);
  const { items: contacts } = useCrmCollection("contacts");
  const stats = useEmailStats();

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
          <span className="DashboardHome__statLabel">Contactos en BD</span>
          <span className="DashboardHome__statValue">{contacts.length}</span>
        </div>
        <div className="DashboardHome__statTile">
          <span className="DashboardHome__statLabel">Suscriptores activos</span>
          <span className="DashboardHome__statValue">{stats.subscribers}</span>
        </div>
        <div className="DashboardHome__statTile">
          <span className="DashboardHome__statLabel">Campañas enviadas</span>
          <span className="DashboardHome__statValue">{stats.campaigns}</span>
        </div>
        <div className="DashboardHome__statTile">
          <span className="DashboardHome__statLabel">Tasa de apertura</span>
          <span className="DashboardHome__statValue">{stats.openRate}</span>
        </div>
        <div className="DashboardHome__statTile">
          <span className="DashboardHome__statLabel">Tasa de clics</span>
          <span className="DashboardHome__statValue">{stats.clickRate}</span>
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
            Tu marketing en marcha
          </h3>
          <p className="DashboardHome__cardText">
            Crea una campaña, capta contactos con formularios y mide tus aperturas. Todo en un solo lugar.
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
