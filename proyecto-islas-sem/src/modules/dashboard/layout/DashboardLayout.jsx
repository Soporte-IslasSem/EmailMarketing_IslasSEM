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
import { api } from "../../../shared/api";

// Avisos arriba del panel: modo soporte (administración de la plataforma dentro de una empresa)
// y días que quedan de la prueba gratis.
function TopNotices({ perms }) {
  const [now] = useState(() => Date.now());
  const a = perms.access;
  const exit = async () => {
    await api("platform/support/exit", {}).catch(() => {});
    try { localStorage.removeItem("islassem:accessOk"); } catch { /* sin almacenamiento */ }
    window.location.href = "/dashboard/plataforma";
  };
  const bar = (bg, children) => <div style={{ background: bg, color: "#1f2d2d", padding: "8px 16px", fontSize: 13.5, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>{children}</div>;
  if (a?.support) {
    return bar("#ffe08a", <>🛟 Modo soporte en <b>{a.orgName}</b> hasta las {new Date(a.supportUntil).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}. Todo lo que hagas queda a nombre de tu email.
      <button className="crm-btn sm" onClick={exit}>Salir del modo soporte</button></>);
  }
  const o = perms.org || {};
  if (o.plan === "trial" && o.trialEndsAt) {
    const days = Math.max(0, Math.ceil((o.trialEndsAt - now) / 864e5));
    return bar(days <= 3 ? "#ffd6d6" : "#e3f4f1", <>Prueba gratis: {days === 0 ? "termina hoy" : `quedan ${days} días`}.
      {perms.isAdmin && <a className="crm-btn sm" href="/dashboard/admin/empresa?tab=plan">Elegir plan</a>}</>);
  }
  return null;
}
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
          <TopNotices perms={perms} />
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
