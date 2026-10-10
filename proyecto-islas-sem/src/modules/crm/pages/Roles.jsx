// Administración › Roles y permisos: matriz editable por rol (entidad × Leer/Agregar/
// Editar/Eliminar/Exportar/Importar) que aplican la app y las reglas de Firestore.
// Los roles "Full access" y "Administrador" tienen siempre acceso total.
import { useMemo, useState } from "react";
import { useCrmCollection } from "../lib/crm";
import {
  usePerms, saveRolesConfig, fullMatrix, levelOf, syncOrgRoles,
  ADMIN_ROLES, NO_ROLE, PERM_ENTITIES, PERMS,
} from "../lib/permissions";
import "../crm.styles.css";

const LEVEL_LABEL = { 0: "Denegar", 1: "Propios", 2: "Todo" };
const LEVEL_CLASS = { 0: "bad", 1: "info", 2: "ok" };
const roleName = (r) => (r === NO_ROLE ? "Sin rol (no está en Empleados)" : r);

export default function Roles() {
  const perms = usePerms();
  const { items: employees, orgId } = useCrmCollection("employees");
  const roles = perms.roles;
  const editable = [...roles.filter((r) => !ADMIN_ROLES.includes(r)), NO_ROLE];
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null); // matriz en edición (todas las filas)
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const role = sel && (editable.includes(sel) || ADMIN_ROLES.includes(sel)) ? sel : editable[0];
  const matrix = useMemo(() => draft || fullMatrix(perms.org.rolePerms, roles), [draft, perms.org.rolePerms, roles]);
  const count = (r) => employees.filter((e) => (e.role || NO_ROLE) === r).length;

  if (!perms.ready) return <div className="crm"><div className="crm-loading">Cargando…</div></div>;
  if (!perms.isAdmin) return <div className="crm"><div className="crm-panel">Solo los administradores pueden ver y cambiar los roles.</div></div>;

  const setLevel = (entity, perm, v) =>
    setDraft((d) => {
      const m = structuredClone(d || matrix);
      m[role] = m[role] || {};
      m[role][entity] = { ...(m[role][entity] || {}), [perm]: v };
      return m;
    });
  const setRow = (entity, v) => setDraft((d) => {
    const m = structuredClone(d || matrix);
    m[role][entity] = Object.fromEntries(PERMS.map((p) => [p.id, p.own ? v : v ? 2 : 0]));
    return m;
  });

  const run = async (fn, ok) => {
    setBusy(true); setMsg("");
    try { await fn(); setMsg(ok); } catch (e) { setMsg("⚠ " + e.message); } finally { setBusy(false); }
  };
  const save = () => run(async () => { await saveRolesConfig(orgId, { rolePerms: fullMatrix(matrix, roles) }); setDraft(null); }, "Permisos guardados. Se aplican al momento.");
  const addRole = () => {
    const name = newRole.trim();
    if (!name || roles.some((r) => r.toLowerCase() === name.toLowerCase()) || name === NO_ROLE) return;
    const next = [...roles, name];
    run(async () => {
      await saveRolesConfig(orgId, { roles: next, rolePerms: fullMatrix(matrix, next) });
      setDraft(null); setNewRole(""); setSel(name);
    }, `Rol "${name}" creado (empieza con los permisos de "Sin rol"; ajústalos y guarda).`);
  };
  const removeRole = (r) => {
    const n = count(r);
    if (n) return alert(`"${r}" lo tienen ${n} empleados. Cámbiales el rol en Empleados antes de quitarlo.`);
    if (!window.confirm(`¿Quitar el rol "${r}"?`)) return;
    const next = roles.filter((x) => x !== r);
    run(async () => {
      const m = { ...fullMatrix(matrix, next) };
      await saveRolesConfig(orgId, { roles: next, rolePerms: m });
      setDraft(null); setSel(null);
    }, `Rol "${r}" quitado.`);
  };
  const resync = () => run(() => syncOrgRoles(orgId, employees, perms.org), "Administradores y roles de Empleados sincronizados.");

  const isAdminRole = ADMIN_ROLES.includes(role);

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Roles y permisos</h1>
          <p>Qué puede hacer cada rol en el CRM. <b>Todo</b> = todos los registros · <b>Propios</b> = solo los que lleva (responsable), creó o tiene asignados · <b>Denegar</b> = nada.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="crm-btn ghost" onClick={resync} disabled={busy} title="Vuelve a aplicar los roles de Empleados">↻ Sincronizar con Empleados</button>
          {draft && <button className="crm-btn ghost" onClick={() => setDraft(null)} disabled={busy}>Descartar</button>}
          <button className="crm-btn" onClick={save} disabled={busy || !draft}>{busy ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      </div>

      {msg && <div className={`crm-chip ${msg.startsWith("⚠") ? "bad" : "ok"}`} style={{ marginBottom: 12, display: "inline-block" }}>{msg}</div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[...ADMIN_ROLES, ...editable].map((r) => (
          <button key={r} className={`crm-btn ${role === r ? "" : "ghost"} sm`} onClick={() => setSel(r)}>
            {roleName(r)} <span style={{ opacity: 0.7 }}>({count(r)})</span>
          </button>
        ))}
      </div>

      {isAdminRole ? (
        <div className="crm-panel">
          <b>{role}</b> tiene <b>acceso total</b> a todo, y además gestiona Empleados, Roles, tipos de cliente, responsables y los ajustes de la organización. No se puede limitar.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="crm-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>{roleName(role)}</th>
                {PERMS.map((p) => <th key={p.id}>{p.label}</th>)}
                <th>Toda la fila</th>
              </tr>
            </thead>
            <tbody>
              {PERM_ENTITIES.map((e) => (
                <tr key={e.id}>
                  <td><b>{e.label}</b></td>
                  {PERMS.map((p) => {
                    const v = matrix[role]?.[e.id]?.[p.id] ?? levelOf(perms.org.rolePerms, role, e.id, p.id);
                    return (
                      <td key={p.id}>
                        <select
                          value={v}
                          onChange={(ev) => setLevel(e.id, p.id, Number(ev.target.value))}
                          className={`crm-chip ${LEVEL_CLASS[v]}`}
                          style={{ border: "none", cursor: "pointer" }}
                        >
                          <option value={0}>Denegar</option>
                          {p.own && <option value={1}>Propios</option>}
                          <option value={2}>{p.own ? "Todo" : "Permitir"}</option>
                        </select>
                      </td>
                    );
                  })}
                  <td>
                    <select value="" onChange={(ev) => ev.target.value !== "" && setRow(e.id, Number(ev.target.value))} style={{ fontSize: 12.5 }}>
                      <option value="">Poner todo…</option>
                      {[2, 1, 0].map((v) => <option key={v} value={v}>{LEVEL_LABEL[v]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="crm-panel" style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <b>Roles</b>
        <input value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRole()} placeholder="Nuevo rol, p. ej. Soporte" style={{ flex: "1 1 200px" }} />
        <button className="crm-btn sm" onClick={addRole} disabled={busy || !newRole.trim()}>+ Crear rol</button>
        {!isAdminRole && role !== NO_ROLE && (
          <button className="crm-btn ghost sm" onClick={() => removeRole(role)} disabled={busy}>Quitar el rol «{role}»</button>
        )}
        <p style={{ flexBasis: "100%", margin: 0, fontSize: 12.5, color: "var(--crm-muted)" }}>
          El rol de cada persona se pone en Administración › Empleados (con el mismo email con el que entra a la app).
          Lo que no se permite aquí se bloquea también en el servidor, no solo en la pantalla.
        </p>
      </div>
    </div>
  );
}
