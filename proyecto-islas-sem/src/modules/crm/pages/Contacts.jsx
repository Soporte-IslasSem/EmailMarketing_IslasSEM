import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import CrmModal from "../components/CrmModal";
import ClientTypesModal from "../components/ClientTypesModal";
import TypeChip from "../components/TypeChip";
import { useCrmCollection, crmCreate, logActivity, fmtDate, tsToDate } from "../lib/crm";
import { useClientTypes, typeOf, RELATIONS } from "../lib/clientTypes";
import { useTaskScope } from "../lib/tasks";
import { CustomFieldsForm } from "../components/CustomFields";
import "../crm.styles.css";

const STAGES = ["Lead", "Contactado", "Propuesta", "Cliente"];
const stageClass = (s) => (s === "Cliente" ? "ok" : s === "Propuesta" ? "warn" : s === "Contactado" ? "info" : "");
const PAGE = 50;

const emptyForm = {
  firstName: "", lastName: "", email: "", phone: "", whatsapp: "",
  company: "", role: "", area: "", clientType: "", relation: "nuevo", stage: "Lead",
  tags: "", responsable: "", dni: "", address: "", city: "", province: "", notes: "",
};

function nextClientId(items) {
  let max = 0;
  items.forEach((c) => { const m = /^CLI-(\d+)$/.exec(c.clientId || ""); if (m) max = Math.max(max, parseInt(m[1])); });
  return "CLI-" + String(max + 1).padStart(4, "0");
}
const initials = (name) => (name || "·").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const fullName = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim();

// Encabezado de columna que ordena al hacer clic (otra vez: invierte el orden).
function Th({ k, sort, onSort, children }) {
  return (
    <th onClick={() => onSort(k)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} title="Ordenar">
      {children} {sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );
}

export default function Contacts() {
  const { items, loading, orgId } = useCrmCollection("contacts");
  const { types } = useClientTypes();
  // Solo los administradores cambian el tipo de cliente (Empleados: rol "Full access"/"Administrador").
  const { isAdmin } = useTaskScope();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState(""); // "" todos · "__none" sin tipo · id
  const [sort, setSort] = useState({ key: "id", dir: 1 });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkType, setBulkType] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const counts = useMemo(() => {
    const c = {};
    items.forEach((x) => { const k = x.clientType || "__none"; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [items]);

  // Orden de los tipos = el de la lista que define la empresa.
  const typeRank = useMemo(() => Object.fromEntries(types.map((t, i) => [t.id, i])), [types]);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    let rows = [...items];
    if (stageFilter) rows = rows.filter((c) => (c.stage || "Lead") === stageFilter);
    if (typeFilter) rows = rows.filter((c) => (typeFilter === "__none" ? !c.clientType : c.clientType === typeFilter));
    if (t) rows = rows.filter((c) =>
      [c.firstName, c.lastName, c.email, c.phone, c.company, c.role, c.responsable, c.clientId, (c.tags || []).join(" "), typeOf(types, c.clientType)?.label]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(t))
    );
    const val = {
      id: (c) => c.clientId || "",
      name: (c) => fullName(c).toLowerCase() || "~",
      company: (c) => String(c.company || "~").toLowerCase(),
      type: (c) => (c.clientType ? typeRank[c.clientType] ?? 999 : 1000),
      stage: (c) => STAGES.indexOf(c.stage || "Lead"),
      responsable: (c) => String(c.responsable || "~").toLowerCase(),
      created: (c) => tsToDate(c.createdAt)?.getTime() || 0,
    }[sort.key];
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      const r = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true });
      return r * sort.dir || (a.clientId || "").localeCompare(b.clientId || "", "es", { numeric: true });
    });
    return rows;
  }, [items, term, stageFilter, typeFilter, sort, types, typeRank]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE, current * PAGE);

  const sortBy = (key) => { setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 })); setPage(1); };

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisible = visible.length > 0 && visible.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); visible.forEach((c) => (allVisible ? n.delete(c.id) : n.add(c.id))); return n; });
  const selectAllFiltered = () => setSelected(new Set(filtered.map((c) => c.id)));

  const applyBulkType = async () => {
    if (!isAdmin || !selected.size || bulkType === "") return;
    const label = bulkType === "__none" ? "sin tipo" : typeOf(types, bulkType)?.label;
    if (!window.confirm(`¿Poner "${label}" a ${selected.size} contactos?`)) return;
    setBulkBusy(true);
    try {
      const ids = [...selected];
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => batch.update(doc(db, "contacts", id), { clientType: bulkType === "__none" ? "" : bulkType, updatedAt: serverTimestamp() }));
        await batch.commit();
      }
      setSelected(new Set());
      setBulkType("");
    } catch (e) {
      alert("No se pudo cambiar el tipo: " + e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.firstName.trim() && !form.email.trim()) return;
    setSaving(true);
    try {
      const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
      const ref = await crmCreate("contacts", orgId, { ...form, tags, clientId: nextClientId(items) });
      await logActivity(orgId, { type: "Nota", title: `Contacto creado: ${form.firstName} ${form.lastName}`.trim(), entity: "contact", entityId: ref.id });
      setForm(emptyForm);
      setShowNew(false);
    } catch (e) {
      alert("No se pudo guardar el contacto: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const filterBtn = (value, label, n) => (
    <button key={value || "all"} className={`crm-btn ${typeFilter === value ? "" : "ghost"} sm`} onClick={() => { setTypeFilter(value); setPage(1); }}>
      {label} <span style={{ opacity: 0.7 }}>({n})</span>
    </button>
  );

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Contactos</h1>
          <p>Toda tu base de datos en un solo lugar · {items.length} contactos</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && <button className="crm-btn ghost" onClick={() => setShowTypes(true)}>🏷 Tipos de cliente</button>}
          <button className="crm-btn" onClick={() => setShowNew(true)}>+ Añadir contacto</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {filterBtn("", "Todos", items.length)}
        {types.map((t) => filterBtn(t.id, `${t.icon ? `${t.icon} ` : ""}${t.label}`, counts[t.id] || 0))}
        {filterBtn("__none", "Sin tipo", counts.__none || 0)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input className="crm-search" style={{ margin: 0, flex: 1, minWidth: 220 }} placeholder="Buscar por nombre, email, empresa, teléfono, ID, tipo…" value={term} onChange={(e) => { setTerm(e.target.value); setPage(1); }} />
        <select className="crm-search" style={{ margin: 0, maxWidth: 190 }} value={stageFilter} onChange={(e) => { setStageFilter(e.target.value); setPage(1); }}>
          <option value="">Todas las etapas</option>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>{filtered.length} resultados</span>
      </div>

      {selected.size > 0 && (
        <div className="crm-panel" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", marginBottom: 12 }}>
          <b>{selected.size} seleccionados</b>
          {selected.size < filtered.length && <button className="crm-btn ghost sm" onClick={selectAllFiltered}>Seleccionar los {filtered.length} del filtro</button>}
          <span style={{ flex: 1 }} />
          {isAdmin && (
            <>
              <select className="crm-search" style={{ margin: 0, maxWidth: 220 }} value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
                <option value="">Cambiar tipo de cliente a…</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                <option value="__none">— Sin tipo —</option>
              </select>
              <button className="crm-btn sm" onClick={applyBulkType} disabled={bulkType === "" || bulkBusy}>{bulkBusy ? "Aplicando…" : "Aplicar"}</button>
            </>
          )}
          <button className="crm-btn ghost sm" onClick={() => setSelected(new Set())}>Quitar selección</button>
        </div>
      )}

      {loading ? (
        <div className="crm-loading">Cargando contactos…</div>
      ) : (
        <>
          <table className="crm-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}><input type="checkbox" checked={allVisible} onChange={toggleAll} title="Seleccionar esta página" /></th>
                <Th k="id" sort={sort} onSort={sortBy}>ID</Th>
                <Th k="name" sort={sort} onSort={sortBy}>Contacto</Th>
                <Th k="company" sort={sort} onSort={sortBy}>Empresa</Th>
                <Th k="type" sort={sort} onSort={sortBy}>Tipo de cliente</Th>
                <th>Etiquetas</th>
                <Th k="stage" sort={sort} onSort={sortBy}>Etapa</Th>
                <Th k="responsable" sort={sort} onSort={sortBy}>Responsable</Th>
                <Th k="created" sort={sort} onSort={sortBy}>Creado</Th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((c) => {
                  const name = fullName(c) || "(sin nombre)";
                  return (
                    <tr key={c.id} style={selected.has(c.id) ? { background: "#f1f9f8" } : undefined}>
                      <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                      <td><span className="crm-link" onClick={() => navigate(`/dashboard/crm/contacts/${c.id}`)}>{c.clientId || "—"}</span></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => navigate(`/dashboard/crm/contacts/${c.id}`)}>
                          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#e6f4f1", color: "#136b68", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, flex: "none" }}>{initials(name)}</span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{name}</div>
                            <div style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>{c.email || "—"}{c.role ? ` · ${c.role}` : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {c.company ? <div><span className="crm-link" onClick={() => navigate(c.companyId ? `/dashboard/crm/companies/${c.companyId}` : "/dashboard/crm/companies")}>{c.company}</span>{c.area && <div style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>{c.area}</div>}</div> : "—"}
                      </td>
                      <td><TypeChip t={typeOf(types, c.clientType)} /></td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(c.tags || []).length ? c.tags.map((t) => <span key={t} className="crm-chip">{t}</span>) : "—"}
                        </div>
                      </td>
                      <td><span className={`crm-chip ${stageClass(c.stage)}`}>{c.stage || "Lead"}</span></td>
                      <td>{c.responsable || "—"}</td>
                      <td>{fmtDate(c.createdAt)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan="9" className="crm-empty">{items.length ? "Ningún contacto con estos filtros." : "Aún no hay contactos. Crea el primero con “+ Añadir contacto”."}</td></tr>
              )}
            </tbody>
          </table>
          {pages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 12 }}>
              <button className="crm-btn ghost sm" disabled={current === 1} onClick={() => setPage(current - 1)}>← Anterior</button>
              <span style={{ fontSize: 13 }}>Página {current} de {pages}</span>
              <button className="crm-btn ghost sm" disabled={current === pages} onClick={() => setPage(current + 1)}>Siguiente →</button>
            </div>
          )}
        </>
      )}

      {showTypes && <ClientTypesModal orgId={orgId} types={types} counts={counts} onClose={() => setShowTypes(false)} />}

      {showNew && (
        <CrmModal
          title="Añadir contacto"
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Añadir contacto"}</button>
            </>
          }
        >
          <div className="crm-two">
            <div className="crm-field"><label>Nombre</label><input value={form.firstName} onChange={set("firstName")} autoFocus /></div>
            <div className="crm-field"><label>Apellidos</label><input value={form.lastName} onChange={set("lastName")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Email</label><input type="email" value={form.email} onChange={set("email")} /></div>
            <div className="crm-field"><label>WhatsApp / Teléfono</label><input value={form.whatsapp} onChange={set("whatsapp")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Empresa</label><input value={form.company} onChange={set("company")} /></div>
            <div className="crm-field"><label>Cargo</label><input value={form.role} onChange={set("role")} placeholder="Ej. Director Financiero" /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Área / Departamento</label><input value={form.area} onChange={set("area")} placeholder="Ej. Marketing" /></div>
            <div className="crm-field"><label>Responsable</label><input value={form.responsable} onChange={set("responsable")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Etapa</label>
              <select value={form.stage} onChange={set("stage")}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <div className="crm-field"><label>Relación</label>
              <select value={form.relation} onChange={set("relation")}>{RELATIONS.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}</select>
            </div>
          </div>
          {isAdmin && (
            <div className="crm-field"><label>Tipo de cliente</label>
              <select value={form.clientType} onChange={set("clientType")}>
                <option value="">— Sin tipo —</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
            </div>
          )}
          <div className="crm-field"><label>Etiquetas (separadas por coma)</label><input value={form.tags} onChange={set("tags")} placeholder="Newsletter, SEO, Cliente" /></div>
          <div className="crm-two">
            <div className="crm-field"><label>DNI / NIF</label><input value={form.dni} onChange={set("dni")} /></div>
            <div className="crm-field"><label>Ciudad / Provincia</label><input value={form.city} onChange={set("city")} /></div>
          </div>
          <div className="crm-field"><label>Notas</label><textarea rows="2" value={form.notes} onChange={set("notes")} /></div>
          <CustomFieldsForm entity="contacts" values={form.custom} onChange={(c) => setForm((f) => ({ ...f, custom: c }))} />
        </CrmModal>
      )}
    </div>
  );
}
