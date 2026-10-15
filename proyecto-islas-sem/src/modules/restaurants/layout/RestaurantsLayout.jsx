// Restaurantes: pantalla completa con su propio menú lateral y buscador (diseño
// "Propuesta CRM Restaurantes"). Vive fuera del panel de ISLAS SEM pero usa la misma
// sesión y organización; "Volver a ISLAS SEM" regresa al panel.
import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useCrmCollection } from "../../crm/lib/crm";
import { COLLECTION, SETTINGS_COLLECTION, DEFAULT_BRAND, searchRestaurants } from "../lib/restaurants";
import "../pages/restaurants.styles.css";
import "./RestaurantsLayout.styles.css";

const MENU = [
  ["/restaurantes", "Panel", true],
  ["/restaurantes/clientes", "Clientes"],
  ["/restaurantes/reservas", "Reservas"],
  ["/restaurantes/resenas", "Reseñas"],
  ["/restaurantes/campanas", "Campañas"],
  ["/restaurantes/equipo", "Equipo y fichajes"],
  ["/restaurantes/ajustes", "Ajustes"],
];

const FIELD_LABEL = {
  name: "Nombre", city: "Ciudad", cuisine: "Cocina", website: "Web", maps: "Ubicación", tour360: "Visita 360º", instagram: "Instagram",
  facebook: "Facebook", tiktok: "TikTok", tripadvisor: "TripAdvisor", otherSocial: "Otras redes", menuText: "Carta", menuLink: "Menú",
  phoneLandline: "Teléfono fijo", phoneMobile: "Móvil", whatsapp: "WhatsApp", email: "Email", bookingCalendar: "Calendario", reviewsGoogle: "Reseñas Google",
  reviewsTripadvisor: "Reseñas TripAdvisor", rgpdLink: "RGPD",
};

function Search({ items }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const results = searchRestaurants(items, term);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const go = (id) => { setOpen(false); setTerm(""); navigate(`/restaurantes/clientes/${id}`); };
  return (
    <div className="rl-search" ref={box}>
      <input value={term} placeholder="Buscar restaurante, enlace o registro…" onFocus={() => setOpen(true)}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" && results[0]) go(results[0].r.id); if (e.key === "Escape") setOpen(false); }} />
      {open && term.trim() && (
        <div className="rl-search__drop">
          {results.length ? results.map(({ r, field }) => (
            <button key={r.id} onClick={() => go(r.id)}>
              <b>{r.name || "(sin nombre)"}</b>
              <small>{field === "name" ? [r.city, r.cuisine].filter(Boolean).join(" · ") || "Ficha de cliente" : `${FIELD_LABEL[field]}: ${r[field]}`}</small>
            </button>
          )) : <div className="rl-search__none">Sin resultados para «{term}».</div>}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="rl-user">
      <button className="rl-user__btn" onClick={() => setOpen((o) => !o)}>{user.displayName || user.email}</button>
      {open && (
        <div className="rl-user__menu" onMouseLeave={() => setOpen(false)}>
          <small>{user.email}</small>
          <button onClick={() => navigate("/dashboard")}>Volver a ISLAS SEM</button>
          <button onClick={onLogout}>Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}

export default function RestaurantsLayout() {
  const { user, loading: authLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { items, loading, orgId } = useCrmCollection(COLLECTION);
  const [settings, setSettings] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!orgId) return undefined;
    return onSnapshot(doc(db, SETTINGS_COLLECTION, orgId), (s) => setSettings(s.data() || {}), () => setSettings({}));
  }, [orgId]);

  useEffect(() => { document.title = "Restaurantes · ISLAS SEM"; }, []);

  if (authLoading) return <div className="rl-wait">Cargando…</div>;
  if (!user) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;

  const brand = settings.brand || DEFAULT_BRAND;
  const logout2 = async () => { await logout(); navigate("/auth/login"); };

  return (
    <div className="rl">
      <header className="rl-top">
        <button className="rl-burger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menú">☰</button>
        <div className="rl-brand" onClick={() => navigate("/restaurantes")}>
          <span className="rl-brand__ic">{(brand.trim()[0] || "C").toUpperCase()}</span>
          <b>{brand}</b>
        </div>
        <Search items={items} />
        <UserMenu user={user} onLogout={logout2} />
      </header>
      <div className="rl-body">
        <nav className={`rl-side ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)}>
          {MENU.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={!!end} className={({ isActive }) => `rl-side__link ${isActive ? "active" : ""}`}>{label}</NavLink>
          ))}
          <button className="rl-side__back" onClick={() => navigate("/dashboard")}>← Volver a ISLAS SEM</button>
        </nav>
        <main className="rl-main">
          <Outlet context={{ items, loading, orgId, settings, brand }} />
        </main>
      </div>
    </div>
  );
}
