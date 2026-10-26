import { useState, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import Sidebar from "../components/Sidebar/Sidebar.jsx";
import Header from "../components/Header/Header.jsx";
import TopNav from "../components/TopNav/TopNav.jsx";
import NewVersionBanner from "../components/NewVersionBanner.jsx";
import ProUpgradeModal from "../../lists/components/ListDetail/modals/ProUpgradeModal";
import { useResponseWatcher } from "../../crm/lib/useResponseWatcher";
import useCrmLink from "../../lists/hooks/useCrmLink";
import { usePerms } from "../../crm/lib/permissions";
import { brandOf, setBrand } from "../../../shared/brand";
import "./DashboardLayout.styles.css";

// Páginas a todo el ancho (tableros con scroll horizontal); el resto va centrado a 1240px como el prototipo
const WIDE = [/\/dashboard\/crm\/pipeline/, /\/dashboard\/crm\/automation/, /\/dashboard\/crm\/newdeal/, /\/dashboard\/crm\/deals\//];

export default function DashboardLayout() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const location = useLocation();
  const wide = WIDE.some((r) => r.test(location.pathname));

  useResponseWatcher(); // reloj de respuesta (SLA): escala ofertas sin respuesta
  useCrmLink(); // CRM ⇄ listas de Email Marketing al momento

  useEffect(() => {
    window.openProUpgradeModal = () => setShowUpgradeModal(true);
  }, []);

  // Sin sesión no se muestra el panel: antes se veía vacío (Firestore bloquea los datos)
  // y algunas pantallas se quedaban en "Cargando…" para siempre.
  const { user, loading } = useAuth();
  const perms = usePerms();
  // Imagen de la empresa para los correos y PDF que se preparan en el navegador.
  useEffect(() => { if (perms.orgId) setBrand(brandOf(perms.orgId, perms.org)); }, [perms.orgId, perms.org]);
  const allowed = !perms.ready || perms.canSeeRoute(location.pathname);
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
              {allowed ? <Outlet /> : (
                <div style={{ padding: 40, textAlign: "center", color: "#6b7d7d" }}>
                  <div style={{ fontSize: 34 }}>🔒</div>
                  <h2 style={{ color: "#264544" }}>No tienes acceso a esta sección</h2>
                  <p>Tu rol no lo permite. Si lo necesitas, pídeselo a un administrador.</p>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      <NewVersionBanner />

      {showUpgradeModal && (
        <ProUpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </>
  );
}
