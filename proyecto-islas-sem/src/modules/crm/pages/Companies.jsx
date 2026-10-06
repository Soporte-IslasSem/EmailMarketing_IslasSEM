import { useMemo, useState } from "react";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmRemove, fmtDate } from "../lib/crm";
import "../crm.styles.css";

const empty = { name: "", cif: "", iban: "", industry: "", website: "", email: "", phone: "", city: "", community: "", rgpd: "Pendiente", notes: "" };
const RGPD = ["Pendiente", "Firmado", "No aplica"];

export default function Companies() {
  const { items, loading, orgId } = useCrmCollection("companies");
  const [term, setTerm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rows = [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (!t) return rows;
    return rows.filter((c) =>
      [c.name, c.cif, c.industry, c.email, c.city].filter(Boolean).some((v) => String(v).toLowerCase().includes(t))
    );
  }, [items, term]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await crmCreate("companies", orgId, form);
      setForm(empty);
      setShowNew(false);
    } catch (e) {
      alert("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Empresas</h1>
          <p>Cuentas y organizaciones con las que trabajas.</p>
        </div>
        <button className="crm-btn" onClick={() => setShowNew(true)}>
          + Nueva empresa
        </button>
      </div>

      <input className="crm-search" placeholder="Buscar empresa…" value={term} onChange={(e) => setTerm(e.target.value)} />

      {loading ? (
        <div className="crm-loading">Cargando empresas…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>CIF/NIF</th>
              <th>IBAN</th>
              <th>Comunidad</th>
              <th>RGPD</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td>{c.cif || "—"}</td>
                  <td>{c.iban || "—"}</td>
                  <td>{c.community || c.city || "—"}</td>
                  <td><span className={`crm-chip ${c.rgpd === "Firmado" ? "ok" : c.rgpd === "No aplica" ? "info" : "warn"}`}>{c.rgpd || "Pendiente"}</span></td>
                  <td>{c.email || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="crm-btn ghost sm"
                      onClick={() => window.confirm(`¿Eliminar "${c.name}"?`) && crmRemove("companies", c.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="crm-empty">Aún no hay empresas.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && (
        <CrmModal
          title="Nueva empresa"
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear empresa"}</button>
            </>
          }
        >
          <div className="crm-field">
            <label>Nombre</label>
            <input value={form.name} onChange={set("name")} autoFocus />
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>CIF/NIF</label><input value={form.cif} onChange={set("cif")} /></div>
            <div className="crm-field"><label>Sector</label><input value={form.industry} onChange={set("industry")} /></div>
          </div>
          <div className="crm-field"><label>IBAN</label><input value={form.iban} onChange={set("iban")} placeholder="ES.. .... .... .... .... ...." /></div>
          <div className="crm-two">
            <div className="crm-field"><label>Email</label><input type="email" value={form.email} onChange={set("email")} /></div>
            <div className="crm-field"><label>Teléfono</label><input value={form.phone} onChange={set("phone")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Ciudad / Localidad</label><input value={form.city} onChange={set("city")} /></div>
            <div className="crm-field"><label>Comunidad autónoma</label><input value={form.community} onChange={set("community")} placeholder="Ej. Canarias" /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Web</label><input value={form.website} onChange={set("website")} /></div>
            <div className="crm-field"><label>RGPD</label>
              <select value={form.rgpd} onChange={set("rgpd")}>{RGPD.map((r) => <option key={r}>{r}</option>)}</select>
            </div>
          </div>
          <div className="crm-field"><label>Notas</label><textarea rows="2" value={form.notes} onChange={set("notes")} /></div>
        </CrmModal>
      )}
    </div>
  );
}
