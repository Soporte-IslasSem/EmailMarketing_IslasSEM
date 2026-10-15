// Restaurantes › Campañas: campañas de email de ISLAS SEM a los restaurantes
// (listado + resultados) y la fidelización de cada restaurante.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import { crmUpdate } from "../../crm/lib/crm";
import { reportMetrics } from "../../reports/reportMetrics";
import { COLLECTION, toUrl, num } from "../lib/restaurants";
import { SECTION, STATUS_LABEL, validEmail, deleteCampaign } from "../lib/restaurantCampaigns";

const fmt = (v) => {
  const d = typeof v?.seconds === "number" ? new Date(v.seconds * 1000) : v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toLocaleDateString("es-ES") : "—";
};

// Campañas (de este usuario) y sus informes, en tiempo real.
function useRestaurantCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const uid = auth.currentUser?.uid;
  useEffect(() => {
    if (!uid) return undefined;
    const u1 = onSnapshot(query(collection(db, "campaigns"), where("ownerId", "==", uid)), (s) => {
      setCampaigns(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.section === SECTION));
      setLoading(false);
    }, (e) => { setError(e.message); setLoading(false); });
    const u2 = onSnapshot(query(collection(db, "reports"), where("ownerId", "==", uid)), (s) => {
      setReports(Object.fromEntries(s.docs.map((d) => [d.id, d.data()])));
    }, () => {});
    return () => { u1(); u2(); };
  }, [uid]);
  return { campaigns, reports, loading, error };
}

export default function CampaignsPage() {
  const { items, orgId } = useOutletContext();
  const navigate = useNavigate();
  const { campaigns, reports, loading, error } = useRestaurantCampaigns();
  const rows = useMemo(() => [...campaigns].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), [campaigns]);
  const restaurants = useMemo(() => [...items].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [items]);
  const withEmail = items.filter((r) => validEmail(r.email)).length;

  const remove = async (c) => {
    const active = ["sending", "scheduled"].includes(c.status);
    if (!window.confirm(`¿Eliminar la campaña "${c.config?.campaignName || "Sin nombre"}"?${active ? " Los correos que aún no se han enviado se cancelarán." : ""}`)) return;
    try {
      const n = await deleteCampaign(orgId, c.id);
      if (n) alert(`Campaña eliminada. Se cancelaron ${n} correo(s) pendientes.`);
    } catch (e) {
      alert("No se pudo eliminar: " + e.message);
    }
  };

  return (
    <div>
      <div className="rp-top">
        <div>
          <h1 className="rp-title">Campañas</h1>
          <p className="rp-sub">Emails de ISLAS SEM a los restaurantes. {withEmail} de {items.length} restaurantes tienen email de contacto.</p>
        </div>
        <button className="rf-btn primary" onClick={() => navigate("/dashboard/restaurantes/campanas/nueva")}>+ Nueva campaña</button>
      </div>

      {error && <p style={{ color: "#b0304c", fontSize: 13 }}>No se pudieron cargar las campañas: {error}</p>}

      <div className="rp-wrap" style={{ marginBottom: 28 }}>
        <table className="rp-table">
          <thead><tr><th>Campaña</th><th>Estado</th><th>Destinatarios</th><th>Enviados</th><th>Aperturas</th><th>Clics</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="rp-empty">Cargando campañas…</td></tr>
            ) : rows.length ? rows.map((c) => {
              const [label, tone] = STATUS_LABEL[c.status] || [c.status || "—", "off"];
              const rep = reports[c.id];
              const m = rep ? reportMetrics(rep) : null;
              const draft = c.status === "draft";
              return (
                <tr key={c.id}>
                  <td>
                    <span className="rp-name" onClick={() => navigate(`/dashboard/restaurantes/campanas/${c.id}`)}>{c.config?.campaignName || "Sin nombre"}</span>
                    <div className="rp-muted" style={{ fontSize: 12 }}>{c.config?.subject || "(sin asunto)"}</div>
                  </td>
                  <td><span className={`rf-status ${tone}`}><i />{label}</span></td>
                  <td>{draft ? (c.restaurantIds?.length || 0) : (c.recipientsCount ?? "—")}</td>
                  <td>{m ? m.sent : "—"}</td>
                  <td>{m ? `${m.opened} (${m.openRate}%)` : "—"}</td>
                  <td>{m ? `${m.clicked} (${m.clickRate}%)` : "—"}</td>
                  <td>{fmt(c.sentAt || c.queuedAt || c.createdAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="rf-open" onClick={() => navigate(`/dashboard/restaurantes/campanas/${c.id}`)}>{draft ? "Continuar" : "Ver resultados"}</button>{" "}
                    <button className="rf-open" style={{ color: "#8a1f45" }} onClick={() => remove(c)}>Eliminar</button>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={8} className="rp-empty">Aún no hay campañas a restaurantes. Crea la primera con «+ Nueva campaña».</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>Fidelización por restaurante</h2>
      <p className="rp-sub" style={{ marginBottom: 12 }}>Lo que cada restaurante tiene activo con su propia clientela.</p>
      <div className="rp-wrap">
        <table className="rp-table">
          <thead><tr><th>Restaurante</th><th>Email de contacto</th><th>Clientela</th><th>Cumpleaños / aniversarios</th><th>NFC en mesa</th><th>Redes</th></tr></thead>
          <tbody>
            {restaurants.length ? restaurants.map((r) => (
              <tr key={r.id}>
                <td><span className="rp-name" onClick={() => navigate(`/dashboard/restaurantes/clientes/${r.id}`)}>{r.name || "(sin nombre)"}</span></td>
                <td className="rp-mono">{validEmail(r.email) ? r.email : <span className="rp-muted">— sin email</span>}</td>
                <td className="rp-mono">{r.customerCount ? `${num(r.customerCount).toLocaleString("es-ES")} registros` : "—"}</td>
                <td>
                  <label className="rf-switch" title="Indica si el restaurante tiene activa esta automatización">
                    <b>{r.birthdayAutomation ? "ON" : "OFF"}</b>
                    <input type="checkbox" checked={!!r.birthdayAutomation} onChange={(e) => crmUpdate(COLLECTION, r.id, { birthdayAutomation: e.target.checked }).catch((er) => alert("No se pudo guardar: " + er.message))} />
                    <span />
                  </label>
                </td>
                <td className="rp-mono">{r.nfcUnits ? `${num(r.nfcUnits)} unidades activas` : "—"}</td>
                <td>
                  <div className="rp-links">
                    {[["Instagram", r.instagram], ["Facebook", r.facebook], ["TikTok", r.tiktok]].map(([l, v]) => (
                      v ? <a key={l} className="rf-open" href={toUrl(v)} target="_blank" rel="noreferrer">{l}</a> : <span key={l} className="rf-open off" title="Sin dato en la ficha">{l}</span>
                    ))}
                  </div>
                </td>
              </tr>
            )) : <tr><td colSpan={6} className="rp-empty">Aún no hay restaurantes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
