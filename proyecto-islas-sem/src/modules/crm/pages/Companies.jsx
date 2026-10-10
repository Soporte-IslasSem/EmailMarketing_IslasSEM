import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmRemove } from "../lib/crm";
import { CustomFieldsForm } from "../components/CustomFields";
import TypeChip from "../components/TypeChip";
import ClientTypesModal from "../components/ClientTypesModal";
import { ownerKey, ownerLabel } from "../lib/owners";
import { useClientTypes, typeOf } from "../lib/clientTypes";
import { useTaskScope } from "../lib/tasks";
import "../crm.styles.css";

const empty = { name: "", cif: "", iban: "", industry: "", website: "", email: "", phone: "", city: "", community: "", rgpd: "Pendiente", notes: "" };
const RGPD = ["Pendiente", "Firmado", "No aplica"];

export default function Companies() {
  const { items, loading, orgId } = useCrmCollection("companies");
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const { types } = useClientTypes();
  const scope = useTaskScope();
  const [typeFilter, setTypeFilter] = useState(""); // "" todos · "__none" · id
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showTypes, setShowTypes] = useState(false);
  const typeCounts = useMemo(() => {
    const c = {};
    items.forEach((x) => { const k = x.clientType || "__none"; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [items]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    let rows = [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (typeFilter) rows = rows.filter((c) => (typeFilter === "__none" ? !c.clientType : c.clientType === typeFilter));
    if (ownerFilter) rows = rows.filter((c) => (ownerFilter === "__none" ? !ownerKey(c) && !c.responsable : ownerKey(c) === ownerFilter));
    if (!t) return rows;
    return rows.filter((c) =>
      [c.name, c.cif, c.industry, c.email, c.city].filter(Boolean).some((v) => String(v).toLowerCase().includes(t))
    );
  }, [items, term, typeFilter, ownerFilter]);

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
        <div style={{ display: "flex", gap: 8 }}>
          {scope.isAdmin && <button className="crm-btn ghost" onClick={() => setShowTypes(true)}>🏷 Tipos de cliente</button>}
          <button className="crm-btn" onClick={() => setShowNew(true)}>+ Nueva empresa</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input className="crm-search" style={{ margin: 0, flex: 1, minWidth: 200 }} placeholder="Buscar empresa…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <select className="crm-search" style={{ margin: 0, maxWidth: 210 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          <option value="__none">— Sin tipo —</option>
        </select>
        <select className="crm-search" style={{ margin: 0, maxWidth: 210 }} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">Todos los responsables</option>
          <option value="__none">— Sin responsable —</option>
          {scope.options.map((o) => <option key={o.key} value={o.key}>{o.type === "team" ? "👥 " : ""}{o.name}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>{filtered.length} empresas</span>
      </div>

      {showTypes && <ClientTypesModal orgId={orgId} types={types} counts={typeCounts} onClose={() => setShowTypes(false)} />}

      {loading ? (
        <div className="crm-loading">Cargando empresas…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo de cliente</th>
              <th>Responsable</th>
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
                  <td><span className="crm-link" onClick={() => navigate(`/dashboard/crm/companies/${c.id}`)}><b>{c.name || "(sin nombre)"}</b></span></td>
                  <td><TypeChip t={typeOf(types, c.clientType)} /></td>
                  <td>{ownerLabel(c)}</td>
                  <td>{c.cif || "—"}</td>
                  <td>{c.iban || "—"}</td>
                  <td>{c.community || c.city || "—"}</td>
                  <td><span className={`crm-chip ${c.rgpd === "Firmado" ? "ok" : c.rgpd === "No aplica" ? "info" : "warn"}`}>{c.rgpd || "Pendiente"}</span></td>
                  <td>{c.email || "—"}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="crm-btn ghost sm" onClick={() => navigate(`/dashboard/crm/companies/${c.id}`)}>Ver ficha</button>{" "}
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
                <td colSpan="9" className="crm-empty">{items.length ? "Ninguna empresa con estos filtros." : "Aún no hay empresas."}</td>
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
          <CustomFieldsForm entity="companies" values={form.custom} onChange={(c) => setForm((f) => ({ ...f, custom: c }))} />
        </CrmModal>
      )}
    </div>
  );
}
