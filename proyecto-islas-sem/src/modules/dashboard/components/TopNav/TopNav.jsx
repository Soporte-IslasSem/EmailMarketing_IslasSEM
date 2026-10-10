import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { areaOf, tabMenu, visibleArea } from "../../../../shared/nav.js";
import { usePerms } from "../../../crm/lib/permissions";
import "./TopNav.styles.css";

export default function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(null);
  const { canSeeRoute } = usePerms();

  const area = visibleArea(areaOf(location.pathname), canSeeRoute);
  if (!area) return null;

  const isActive = (route) => location.pathname === route || location.pathname.startsWith(route + "/");

  return (
    <nav className="TopNav">
      {area.tabs.map((t, i) => {
        // pestaña directa
        if (Array.isArray(t)) {
          const [route, label] = t;
          return (
            <button key={route} className={`TopNav__tab ${isActive(route) ? "on" : ""}`} onClick={() => navigate(route)}>
              {label}
            </button>
          );
        }
        // pestaña con desplegable
        const menu = tabMenu(t);
        const anyActive = menu.some(([route]) => isActive(route));
        const open = openMenu === i;
        return (
          <div key={t.label} className="TopNav__dd" onMouseLeave={() => setOpenMenu(null)}>
            <button
              className={`TopNav__tab ${anyActive ? "on" : ""}`}
              onClick={() => setOpenMenu(open ? null : i)}
            >
              {t.label} <span className="TopNav__caret">▾</span>
            </button>
            {open && (
              <div className="TopNav__menu">
                {menu.map(([route, label]) => (
                  <button
                    key={route}
                    className={isActive(route) ? "on" : ""}
                    onClick={() => {
                      navigate(route);
                      setOpenMenu(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
