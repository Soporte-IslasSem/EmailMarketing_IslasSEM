// Restaurantes › Clientes: listado de fichas.
import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import CrmModal from "../../crm/components/CrmModal";
import { crmCreate, crmRemove, fmtDate } from "../../crm/lib/crm";
import { exportCsv } from "../../crm/lib/exportCsv";
import { COLLECTION, EMPTY, CSV_COLUMNS, toUrl, completion } from "../lib/restaurants";
import { validEmail } from "../lib/restaurantCampaigns";
import RestaurantImportModal from "../components/RestaurantImportModal";
import "../../crm/crm.styles.css";

export default function Clients() {
  const { items, loading, orgId } = useOutletContext();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return t ? sorted.filter((r) => [r.name, r.city, r.cuisine, r.website].some((v) => String(v || "").toLowerCase().includes(t))) : sorted;
  }, [items, term]);

  const create = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const ref = await crmCreate(COLLECTION, orgId, { ...EMPTY, name: name.trim() });
      navigate(`/dashboard/restaurantes/clientes/${ref.id}`);
    } catch (e) {
      alert("No se pudo crear: " + e.message);
      setSaving(false);
    }
  };

  const exportAll = () => exportCsv("restaurantes", rows, CSV_COLUMNS.map(([k, h]) => [h,
    k === "id" ? (r) => r.id : k === "birthdayAutomation" ? (r) => (r.birthdayAutomation ? "ON" : "OFF") : (r) => r[k]]));
  const withEmail = items.filter((r) => validEmail(r.email)).length;

  return (
    <div>
      <div className="rp-top">
        <div>
          <h1 className="rp-title">Clientes</h1>
          <p className="rp-sub">Fichas de cliente de cada restaurante.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="rf-btn" onClick={exportAll} disabled={!rows.length}>⬇ Exportar ({rows.length})</button>
          <button className="rf-btn" onClick={() => setShowImport(true)}>⬆ Importar</button>
          <button className="rf-btn primary" onClick={() => setShowNew(true)}>+ Nuevo restaurante</button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#eef7f6", border: "1px solid #cfe6e4", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>
        <span style={{ fontSize: 20 }}>✉️</span>
        <span style={{ flex: 1, minWidth: 240 }}>
          <b>Lista de correo de restaurantes:</b> se forma sola con el <b>Email de contacto</b> de cada ficha
          ({withEmail} de {items.length} lo tienen). Para enviarles un correo: <b>Campañas</b> → nueva campaña → elige los restaurantes.
        </span>
        <button className="rf-btn primary" onClick={() => navigate("/dashboard/restaurantes/campanas")}>Ir a Campañas</button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <input className="rp-input" style={{ flex: 1, maxWidth: 380 }} placeholder="Filtrar por nombre, ciudad o cocina…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <span className="rp-muted" style={{ fontSize: 13 }}>{rows.length} restaurantes</span>
      </div>

      <div className="rp-wrap">
        <table className="rp-table">
          <thead>
            <tr><th></th><th>Restaurante</th><th>Ciudad</th><th>Tipo de cocina</th><th>Web</th><th>Email</th><th>Ficha</th><th>Actualizado</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="rp-empty">Cargando restaurantes…</td></tr>
            ) : rows.length ? rows.map((r) => {
              const pct = completion(r);
              return (
                <tr key={r.id}>
                  <td style={{ width: 44 }}>{r.logo ? <img src={r.logo} alt="" className="rf-thumb" /> : <span className="rf-thumb empty">🍽</span>}</td>
                  <td><span className="rp-name" onClick={() => navigate(`/dashboard/restaurantes/clientes/${r.id}`)}>{r.name || "(sin nombre)"}</span></td>
                  <td>{r.city || "—"}</td>
                  <td>{r.cuisine || "—"}</td>
                  <td>{r.website ? <a href={toUrl(r.website)} target="_blank" rel="noreferrer" style={{ color: "#1f5c46" }}>{r.website}</a> : "—"}</td>
                  <td>{validEmail(r.email) ? r.email : <span className="rp-muted">— sin email</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}><span className="rp-bar"><i style={{ width: `${pct}%` }} /></span><span className="rp-muted">{pct}%</span></td>
                  <td>{fmtDate(r.updatedAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="rf-open" onClick={() => navigate(`/dashboard/restaurantes/clientes/${r.id}`)}>Ver ficha</button>{" "}
                    <button className="rf-open" style={{ color: "#8a1f45" }} onClick={() => window.confirm(`¿Eliminar "${r.name}"? Podrás recuperarlo desde la Papelera de reciclaje del CRM.`) && crmRemove(COLLECTION, r.id).catch((e) => alert("No se pudo eliminar: " + e.message))}>Eliminar</button>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={9} className="rp-empty">
                {term ? "Ningún restaurante coincide con el filtro." : "Aún no hay restaurantes. Crea el primero con «+ Nuevo restaurante»."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <CrmModal title="Nuevo restaurante" onClose={() => setShowNew(false)} maxWidth={440}
          footer={<><button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button><button className="crm-btn" onClick={create} disabled={saving || !name.trim()}>{saving ? "Creando…" : "Crear y abrir ficha"}</button></>}>
          <label style={{ fontSize: 13, color: "#6f736d" }}>Nombre del restaurante</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="p. ej. Vulcano Fusión" style={{ width: "100%", marginTop: 6 }} />
          <p style={{ fontSize: 13, color: "#6f736d", margin: "10px 0 0" }}>El resto de datos los completas en la ficha.</p>
        </CrmModal>
      )}
      {showImport && <RestaurantImportModal orgId={orgId} existing={items} onClose={() => setShowImport(false)} />}
    </div>
  );
}
