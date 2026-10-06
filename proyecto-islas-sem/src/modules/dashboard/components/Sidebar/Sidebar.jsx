import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../../shared/hooks/useAuth.jsx";
import { AREAS, areaOf, firstRoute } from "../../../../shared/nav.js";
import "./Sidebar.styles.css";

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
  ),
  plane: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>
  ),
  crm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" /></svg>
  ),
  task: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="m8 12 3 3 5-6" /></svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /></svg>
  ),
};

export default function Sidebar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeArea = areaOf(location.pathname).id;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("islassem_sidebar_collapsed") === "1"; } catch { return false; }
  });
  const toggle = () => setCollapsed((c) => {
    const n = !c;
    try { localStorage.setItem("islassem_sidebar_collapsed", n ? "1" : "0"); } catch { /* ignore */ }
    return n;
  });

  const handleLogout = async () => {
    await logout();
    navigate("/auth/login");
  };

  return (
    <aside className={`Sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="Sidebar__top">
        <button className="Sidebar__burger" onClick={toggle} title={collapsed ? "Expandir menú" : "Colapsar menú"} aria-label="Menú">
          <span></span><span></span><span></span>
        </button>

        <div className="Sidebar__logoWrapper">
          <img src="/islas-sem-logo-white.png" alt="Islas SEM" className="Sidebar__logo" />
        </div>

        <nav className="Sidebar__nav">
          {AREAS.map((area) => (
            <button
              key={area.id}
              className={`Sidebar__link ${activeArea === area.id ? "active" : ""}`}
              onClick={() => navigate(firstRoute(area))}
              title={collapsed ? area.label : undefined}
            >
              <span className="Sidebar__ic">{ICONS[area.icon]}</span>
              <span className="Sidebar__label">{area.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="Sidebar__bottom">
        {user && (
          <div className="Sidebar__user">
            <span>{user.email}</span>
          </div>
        )}
        <button className="Sidebar__logoutButton" onClick={handleLogout} title={collapsed ? "Cerrar sesión" : undefined}>
          <svg className="Sidebar__logoutIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
          <span className="Sidebar__logoutText">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
