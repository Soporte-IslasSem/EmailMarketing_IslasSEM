import { useMemo, useState } from "react";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove, fmtDate } from "../lib/crm";
import { usePerms, syncOrgRoles, ADMIN_ROLES } from "../lib/permissions";
import "../crm.styles.css";

const empty = { firstName: "", lastName: "", email: "", phone: "", department: "", role: "Comercial", twoFA: false };

export default function Employees() {
  const { items, loading, orgId } = useCrmCollection("employees");
  const [term, setTerm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const perms = usePerms();
  const ROLES = perms.roles;

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rows = [...items].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    if (!t) return rows;
    return rows.filter((e) => [e.firstName, e.lastName, e.email, e.department, e.role].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
  }, [items, term]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Si tras el cambio hay administradores y tú no estás entre ellos, perderías el acceso de
  // administrador (Empleados, Roles, tipos de cliente…): se pide confirmación.
  const confirmKeepAdmin = (next) => {
    const admins = next.filter((e) => ADMIN_ROLES.includes(e.role) && e.email).map((e) => String(e.email).toLowerCase());
    if (!admins.length || admins.includes(perms.email)) return true;
    return window.confirm(`Después de este cambio los administradores serán: ${admins.join(", ")}.

Tú (${perms.email}) dejarás de ser administrador y no podrás deshacerlo. ¿Continuar?`);
  };
  const remove = async (emp) => {
    if (!window.confirm("¿Eliminar empleado?")) return;
    const next = items.filter((e) => e.id !== emp.id);
    if (!confirmKeepAdmin(next)) return;
    try {
      await crmRemove("employees", emp.id);
      await syncOrgRoles(orgId, next, perms.org);
    } catch (e) {
      alert("No se pudo eliminar: " + e.message);
    }
  };

  const openNew = () => { setForm(empty); setEditing(null); setShowNew(true); };
  const openEdit = (emp) => { setForm({ ...empty, ...emp }); setEditing(emp.id); setShowNew(true); };

  const save = async () => {
    if (!form.firstName.trim() && !form.email.trim()) return;
    const data = { firstName: form.firstName, lastName: form.lastName, email: form.email.trim().toLowerCase(), phone: form.phone, department: form.department, role: form.role, twoFA: !!form.twoFA };
    const next = editing ? items.map((e) => (e.id === editing ? { ...e, ...data } : e)) : [...items, data];
    if (!confirmKeepAdmin(next)) return;
    setSaving(true);
    try {
      if (editing) await crmUpdate("employees", editing, data);
      else await crmCreate("employees", orgId, data);
      await syncOrgRoles(orgId, next, perms.org);
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
          <h1>Empleados · Estructura de empresa</h1>
          <p>Personas del equipo con su departamento y rol de acceso.</p>
        </div>
        <button className="crm-btn" onClick={openNew}>+ Invitar empleado</button>
      </div>

      <input className="crm-search" placeholder="Buscar empleado…" value={term} onChange={(e) => setTerm(e.target.value)} />

      {loading ? (
        <div className="crm-loading">Cargando empleados…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Departamento</th><th>Rol</th><th>2FA</th><th>Alta</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((e) => (
                <tr key={e.id}>
                  <td><b>{`${e.firstName || ""} ${e.lastName || ""}`.trim() || "—"}</b></td>
                  <td>{e.email || "—"}</td>
                  <td>{e.phone || "—"}</td>
                  <td>{e.department || "—"}</td>
                  <td><span className="crm-chip info">{e.role}</span></td>
                  <td>{e.twoFA ? "✅" : "—"}</td>
                  <td>{fmtDate(e.createdAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="crm-btn ghost sm" onClick={() => openEdit(e)}>✎ Editar</button>{" "}
                    <button className="crm-btn ghost sm" onClick={() => remove(e)}>Eliminar</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="8" className="crm-empty">Aún no hay empleados. Invita al primero.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && (
        <CrmModal
          title={editing ? "Editar empleado" : "Invitar empleado"}
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Invitar"}</button>
            </>
          }
        >
          <div className="crm-two">
            <div className="crm-field"><label>Nombre</label><input value={form.firstName} onChange={set("firstName")} autoFocus /></div>
            <div className="crm-field"><label>Apellidos</label><input value={form.lastName} onChange={set("lastName")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Email</label><input type="email" value={form.email} onChange={set("email")} /></div>
            <div className="crm-field"><label>Teléfono</label><input value={form.phone} onChange={set("phone")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Departamento</label><input value={form.department} onChange={set("department")} /></div>
            <div className="crm-field"><label>Rol</label>
              <select value={form.role} onChange={set("role")}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={!!form.twoFA} onChange={(e) => setForm((f) => ({ ...f, twoFA: e.target.checked }))} />
            Doble factor de autenticación (2FA)
          </label>
        </CrmModal>
      )}
    </div>
  );
}
