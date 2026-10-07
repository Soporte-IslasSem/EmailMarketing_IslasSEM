import { useState, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import Sidebar from "../components/Sidebar/Sidebar.jsx";
import Header from "../components/Header/Header.jsx";
import TopNav from "../components/TopNav/TopNav.jsx";
import ProUpgradeModal from "../../lists/components/ListDetail/modals/ProUpgradeModal";
import { useResponseWatcher } from "../../crm/lib/useResponseWatcher";
import "./DashboardLayout.styles.css";

// Páginas a todo el ancho (tableros con scroll horizontal); el resto va centrado a 1240px como el prototipo
const WIDE = [/\/dashboard\/crm\/pipeline/, /\/dashboard\/crm\/automation/, /\/dashboard\/crm\/newdeal/, /\/dashboard\/crm\/deals\//];

export default function DashboardLayout() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const location = useLocation();
  const wide = WIDE.some((r) => r.test(location.pathname));

  useResponseWatcher(); // reloj de respuesta (SLA): escala ofertas sin respuesta

  useEffect(() => {
    window.openProUpgradeModal = () => setShowUpgradeModal(true);
  }, []);

  // Sin sesión no se muestra el panel: antes se veía vacío (Firestore bloquea los datos)
  // y algunas pantallas se quedaban en "Cargando…" para siempre.
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#6b7d7d" }}>Cargando…</div>;
  if (!user) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;

  return (
    <>
      <div className="DashboardLayout">
        <Sidebar />

        <div className="DashboardLayout__content">
          <Header />
          <TopNav />

          <main className="DashboardLayout__main">
            <div className={`DashboardLayout__inner ${wide ? "wide" : ""}`}>
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {showUpgradeModal && (
        <ProUpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </>
  );
}
