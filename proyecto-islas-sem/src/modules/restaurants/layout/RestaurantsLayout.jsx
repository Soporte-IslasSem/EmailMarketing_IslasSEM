// Restaurantes dentro del panel de ISLAS SEM (diseño "Propuesta CRM Restaurantes").
// El submenú (Panel, Clientes, Reservas…) va en el menú lateral del panel (shared/nav.js);
// aquí solo la barra con la marca y el buscador, y los datos que comparten las páginas.
import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useCrmCollection } from "../../crm/lib/crm";
import { COLLECTION, SETTINGS_COLLECTION, DEFAULT_BRAND, searchRestaurants } from "../lib/restaurants";
import "../pages/restaurants.styles.css";
import "./RestaurantsLayout.styles.css";

export const BASE = "/dashboard/restaurantes";

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
  const go = (id) => { setOpen(false); setTerm(""); navigate(`${BASE}/clientes/${id}`); };
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

// Enlaces antiguos /restaurantes/... (era una pantalla aparte) → /dashboard/restaurantes/...
export function LegacyRestaurants() {
  const { pathname, search } = useLocation();
  return <Navigate to={`/dashboard${pathname}${search}`} replace />;
}

export default function RestaurantsLayout() {
  const navigate = useNavigate();
  const { items, loading, orgId } = useCrmCollection(COLLECTION);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    if (!orgId) return undefined;
    return onSnapshot(doc(db, SETTINGS_COLLECTION, orgId), (s) => setSettings(s.data() || {}), () => setSettings({}));
  }, [orgId]);

  useEffect(() => {
    const prev = document.title;
    document.title = "Restaurantes · ISLAS SEM";
    return () => { document.title = prev; };
  }, []);

  const brand = settings.brand || DEFAULT_BRAND;

  return (
    <div className="rl">
      <div className="rl-top">
        <div className="rl-brand" onClick={() => navigate(BASE)}>
          <span className="rl-brand__ic">{(brand.trim()[0] || "C").toUpperCase()}</span>
          <b>{brand}</b>
        </div>
        <Search items={items} />
      </div>
      <Outlet context={{ items, loading, orgId, settings, brand }} />
    </div>
  );
}
