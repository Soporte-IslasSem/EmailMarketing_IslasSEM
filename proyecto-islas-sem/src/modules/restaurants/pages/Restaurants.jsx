// Restaurantes › listado de fichas.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrmModal from "../../crm/components/CrmModal";
import { useCrmCollection, crmCreate, crmRemove, fmtDate } from "../../crm/lib/crm";
import { COLLECTION, EMPTY, toUrl } from "../lib/restaurants";
import "../../crm/crm.styles.css";
import "./restaurants.styles.css";

export default function Restaurants() {
  const { items, loading, orgId } = useCrmCollection(COLLECTION);
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return t ? sorted.filter((r) => [r.name, r.city, r.cuisine, r.website].some((v) => String(v || "").toLowerCase().includes(t))) : sorted;
  }, [items, term]);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const ref = await crmCreate(COLLECTION, orgId, { ...EMPTY, name: name.trim() });
      navigate(`/dashboard/restaurants/${ref.id}`);
    } catch (e) {
      alert("No se pudo crear: " + e.message);
      setSaving(false);
    }
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Restaurantes</h1>
          <p>Fichas de cliente de los restaurantes: escaparate, conversiones, data, marketing y gestión.</p>
        </div>
        <button className="crm-btn" onClick={() => setShowNew(true)}>+ Nuevo restaurante</button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <input className="crm-search" style={{ margin: 0, flex: 1 }} placeholder="Buscar restaurante, ciudad o cocina…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>{rows.length} restaurantes</span>
      </div>

      {loading ? (
        <div className="crm-loading">Cargando restaurantes…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr><th></th><th>Restaurante</th><th>Ciudad</th><th>Tipo de cocina</th><th>Web</th><th>Actualizado</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id}>
                <td style={{ width: 44 }}>{r.logo ? <img src={r.logo} alt="" className="rf-thumb" /> : <span className="rf-thumb empty">🍽</span>}</td>
                <td><span className="crm-link" onClick={() => navigate(`/dashboard/restaurants/${r.id}`)}><b>{r.name || "(sin nombre)"}</b></span></td>
                <td>{r.city || "—"}</td>
                <td>{r.cuisine || "—"}</td>
                <td>{r.website ? <a href={toUrl(r.website)} target="_blank" rel="noreferrer">{r.website}</a> : "—"}</td>
                <td>{fmtDate(r.updatedAt)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="crm-btn ghost sm" onClick={() => navigate(`/dashboard/restaurants/${r.id}`)}>Ver ficha</button>{" "}
                  <button className="crm-btn ghost sm" onClick={() => window.confirm(`¿Eliminar "${r.name}"? Podrás recuperarlo desde la Papelera de reciclaje del CRM.`) && crmRemove(COLLECTION, r.id).catch((e) => alert("No se pudo eliminar: " + e.message))}>Eliminar</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--crm-muted)", padding: 30 }}>
                {term ? "Ningún restaurante coincide con la búsqueda." : "Aún no hay restaurantes. Crea el primero con «+ Nuevo restaurante»."}
              </td></tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && (
        <CrmModal title="Nuevo restaurante" onClose={() => setShowNew(false)} maxWidth={440}
          footer={<><button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button><button className="crm-btn" onClick={create} disabled={saving || !name.trim()}>{saving ? "Creando…" : "Crear y abrir ficha"}</button></>}>
          <label style={{ fontSize: 13, color: "var(--crm-muted)" }}>Nombre del restaurante</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="p. ej. Vulcano Fusión" style={{ width: "100%", marginTop: 6 }} />
          <p style={{ fontSize: 13, color: "var(--crm-muted)", margin: "10px 0 0" }}>El resto de datos los completas en la ficha.</p>
        </CrmModal>
      )}
    </div>
  );
}
