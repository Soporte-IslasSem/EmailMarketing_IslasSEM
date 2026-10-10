// Roles y permisos de la organización (Administración › Roles y permisos).
//
// Todo vive en organizations/{orgId} y lo aplican tanto la app como las reglas de
// Firestore (firestore.rules), así que no basta con saltarse la pantalla:
// - adminEmails: emails de los empleados con rol "Full access" / "Administrador". Si está
//   vacío (aún no hay administradores), todos los usuarios lo son (nadie se queda fuera).
// - memberRoles: { email: rol } de cada empleado (se sincroniza desde Empleados).
// - roles: lista de roles que se pueden asignar.
// - rolePerms: { rol: { entidad: { read, add, edit, delete, export, import } } } con
//   niveles 0 = Denegar, 1 = Propios, 2 = Todo (Agregar/Exportar/Importar: 0 o 2).
//   "_sinrol" se aplica a usuarios que no están en Empleados.
// "Propios" = registros donde el usuario es el responsable (ownerEmail), quien lo creó
// (createdByEmail) o el asignado (assigneeEmail).
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useOrg } from "./useOrg";

export const ADMIN_ROLES = ["Full access", "Administrador"];
export const NO_ROLE = "_sinrol";

export const PERM_ENTITIES = [
  { id: "leads", label: "Prospectos" },
  { id: "deals", label: "Negociaciones" },
  { id: "contacts", label: "Contactos" },
  { id: "companies", label: "Compañías" },
  { id: "products", label: "Productos" },
  { id: "quotes", label: "Cotizaciones" },
  { id: "invoices", label: "Facturas" },
  { id: "campaigns", label: "Campañas (Email Marketing)" },
];

// own: admite el nivel "Propios".
export const PERMS = [
  { id: "read", label: "Leer", own: true },
  { id: "add", label: "Agregar", own: false },
  { id: "edit", label: "Editar", own: true },
  { id: "delete", label: "Eliminar", own: true },
  { id: "export", label: "Exportar", own: false },
  { id: "import", label: "Importar", own: false },
];

export const DEFAULT_ROLES = ["Full access", "Administrador", "Manager", "Comercial", "Marketing", "Colaborador", "Proveedor", "Alumno/a en prácticas"];

const all = (v) => Object.fromEntries(PERMS.map((p) => [p.id, p.own ? v : v ? 2 : 0]));
const ents = (fn) => Object.fromEntries(PERM_ENTITIES.map((e) => [e.id, fn(e.id)]));
// Permisos de partida (editables). Los administradores siempre tienen todo.
export const DEFAULT_PERMS = {
  Manager: ents(() => all(2)),
  Comercial: ents((e) => (e === "campaigns" ? { ...all(0), read: 2 } : { read: 2, add: 2, edit: 1, delete: 0, export: 0, import: 0 })),
  Marketing: ents((e) => (e === "campaigns" ? all(2) : { read: 2, add: 2, edit: 1, delete: 0, export: 2, import: 2 })),
  Colaborador: ents((e) => (e === "campaigns" ? all(0) : { read: 1, add: 2, edit: 1, delete: 0, export: 0, import: 0 })),
  Proveedor: ents(() => all(0)),
  "Alumno/a en prácticas": ents((e) => (e === "campaigns" ? all(0) : { read: 1, add: 0, edit: 0, delete: 0, export: 0, import: 0 })),
  [NO_ROLE]: ents(() => all(2)),
};

const norm = (s) => String(s || "").trim().toLowerCase();

// Nivel de un rol para una entidad y permiso (con los valores por defecto).
export function levelOf(rolePerms, role, entity, perm) {
  const v = rolePerms?.[role]?.[entity]?.[perm];
  if (typeof v === "number") return v;
  const d = DEFAULT_PERMS[role]?.[entity]?.[perm];
  return typeof d === "number" ? d : DEFAULT_PERMS[NO_ROLE][entity]?.[perm] ?? 2;
}

// Rutas de la app → entidad que hace falta poder leer.
const ROUTE_ENTITY = [
  [/^\/dashboard\/crm\/(leads)/, "leads"],
  [/^\/dashboard\/crm\/(pipeline|deals|newdeal)/, "deals"],
  [/^\/dashboard\/crm\/contacts/, "contacts"],
  [/^\/dashboard\/crm\/companies/, "companies"],
  [/^\/dashboard\/crm\/products/, "products"],
  [/^\/dashboard\/crm\/quotes/, "quotes"],
  [/^\/dashboard\/crm\/invoices/, "invoices"],
  [/^\/dashboard\/(campaigns|automations|reports|templates|lists)/, "campaigns"],
];

export function usePerms() {
  const { orgId, user } = useOrg();
  const [org, setOrg] = useState(null);
  useEffect(() => {
    if (!orgId) return undefined;
    return onSnapshot(doc(db, "organizations", orgId), (s) => setOrg(s.data() || {}), () => setOrg({}));
  }, [orgId]);

  return useMemo(() => {
    const email = norm(user?.email);
    const admins = (org?.adminEmails || []).map(norm);
    const isAdmin = !admins.length || admins.includes(email);
    const role = org?.memberRoles?.[email] || NO_ROLE;
    const level = (entity, perm) => (isAdmin ? 2 : levelOf(org?.rolePerms, role, entity, perm));
    const isOwn = (d) => !!email && [d?.ownerEmail, d?.createdByEmail, d?.assigneeEmail].some((x) => norm(x) === email);
    // ¿Puede hacer `perm` sobre este registro concreto?
    const can = (entity, perm, d) => { const l = level(entity, perm); return l === 2 || (l === 1 && (!d || isOwn(d))); };
    // Lista visible según "Leer" (Propios = solo los suyos).
    const visible = (entity, rows) => { const l = level(entity, "read"); return l === 2 ? rows : l === 1 ? rows.filter(isOwn) : []; };
    const canSeeRoute = (path) => {
      if (/^\/dashboard\/admin/.test(path)) return isAdmin;
      if (/^\/dashboard\/campaigns\/create/.test(path)) return level("campaigns", "add") > 0;
      if (/^\/dashboard\/campaigns\/edit/.test(path)) return level("campaigns", "edit") > 0;
      if (/^\/dashboard\/crm\/newdeal/.test(path)) return level("deals", "add") > 0;
      const hit = ROUTE_ENTITY.find(([re]) => re.test(path));
      return !hit || level(hit[1], "read") > 0;
    };
    return {
      ready: !!org, email, isAdmin, role, org: org || {}, level, isOwn, can, visible, canSeeRoute,
      roles: Array.isArray(org?.roles) && org.roles.length ? org.roles : DEFAULT_ROLES,
    };
  }, [org, user]);
}

// Matriz completa (todos los roles, entidades y permisos con su valor) para guardarla:
// las reglas de Firestore no conocen los valores por defecto de aquí.
export function fullMatrix(rolePerms, roles) {
  const out = {};
  for (const r of [...roles.filter((x) => !ADMIN_ROLES.includes(x)), NO_ROLE]) {
    out[r] = Object.fromEntries(PERM_ENTITIES.map((e) => [e.id, Object.fromEntries(PERMS.map((p) => [p.id, levelOf(rolePerms, r, e.id, p.id)]))]));
  }
  return out;
}

// Empleados → organizations/{orgId}.adminEmails, memberRoles y rolePerms (lo que leen las reglas).
export async function syncOrgRoles(orgId, employees, org = {}) {
  const adminEmails = [...new Set(employees.filter((e) => ADMIN_ROLES.includes(e.role) && e.email).map((e) => norm(e.email)))];
  const memberRoles = Object.fromEntries(employees.filter((e) => e.email).map((e) => [norm(e.email), e.role || NO_ROLE]));
  const roles = Array.isArray(org.roles) && org.roles.length ? org.roles : DEFAULT_ROLES;
  await updateDoc(doc(db, "organizations", orgId), { adminEmails, memberRoles, roles, rolePerms: fullMatrix(org.rolePerms, roles) });
}

export const saveRolesConfig = (orgId, data) => updateDoc(doc(db, "organizations", orgId), data);
