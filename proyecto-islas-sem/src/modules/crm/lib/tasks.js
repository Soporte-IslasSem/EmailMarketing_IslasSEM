// Tareas por persona y equipo + Google Calendar.
//
// Asignación (en cada activity): assigneeType "person" | "team", assigneeId (empleado o
// equipo), assigneeName, assigneeEmail (persona). Las tareas antiguas solo traen
// "assignee" (texto): se muestran tal cual.
//
// Quién ve qué (vista de la app; los datos del CRM siguen siendo de toda la organización):
// - Administradores (empleados con rol "Full access" / "Administrador"): todas.
// - Resto: las suyas, las de sus equipos y las que crearon. Mientras no haya ningún
//   administrador marcado en Empleados, todos son administradores (nadie se queda fuera).
import { useEffect, useMemo, useState } from "react";
import { auth } from "../../../config/firebaseConfig";
import { useCrmCollection } from "./crm";
import { useOrg } from "./useOrg";

export const ADMIN_ROLES = ["Full access", "Administrador"];
const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";
const norm = (s) => String(s || "").trim().toLowerCase();
export const fullName = (e) => `${e.firstName || ""} ${e.lastName || ""}`.trim() || e.email || "Sin nombre";

export function useTaskScope() {
  const { user } = useOrg();
  const { items: employees } = useCrmCollection("employees");
  const { items: teams } = useCrmCollection("salesteams");
  return useMemo(() => {
    const email = norm(user?.email);
    const me = employees.find((e) => norm(e.email) === email) || null;
    const myName = me ? fullName(me) : "";
    const myTeams = me ? teams.filter((t) => (t.members || []).includes(myName)) : [];
    const anyAdmin = employees.some((e) => ADMIN_ROLES.includes(e.role));
    const isAdmin = !anyAdmin || (!!me && ADMIN_ROLES.includes(me.role));
    const myTeamIds = new Set(myTeams.map((t) => t.id));

    const isMine = (a) =>
      (a.assigneeType === "person" && ((me && a.assigneeId === me.id) || (email && norm(a.assigneeEmail) === email))) ||
      (a.assigneeType === "team" && myTeamIds.has(a.assigneeId)) ||
      (!!email && norm(a.createdByEmail) === email) ||
      (!a.assigneeType && !!myName && a.assignee === myName);
    const canSee = (a) => isAdmin || isMine(a);

    const people = [...employees].sort((a, b) => fullName(a).localeCompare(fullName(b)));
    const options = [
      ...people.map((e) => ({ key: `person:${e.id}`, type: "person", id: e.id, name: fullName(e), email: norm(e.email) })),
      ...teams.map((t) => ({ key: `team:${t.id}`, type: "team", id: t.id, name: t.name || "Equipo", email: "" })),
    ];
    // Un no-administrador solo puede asignarse tareas a sí mismo.
    const assignOptions = isAdmin ? options : options.filter((o) => o.type === "person" && me && o.id === me.id);

    return { email, me, myName, myTeams, isAdmin, anyAdmin, isMine, canSee, people, teams, options, assignOptions };
  }, [user, employees, teams]);
}

export const assigneeKey = (a) => (a.assigneeType && a.assigneeId ? `${a.assigneeType}:${a.assigneeId}` : "");
export const assigneeLabel = (a) =>
  a.assigneeType ? `${a.assigneeType === "team" ? "👥 " : ""}${a.assigneeName || "—"}` : a.assignee || "—";

// Campos de asignación a partir de una opción (o vacíos).
export function assigneeFields(opt) {
  return opt
    ? { assigneeType: opt.type, assigneeId: opt.id, assigneeName: opt.name, assigneeEmail: opt.email || "" }
    : { assigneeType: "", assigneeId: "", assigneeName: "", assigneeEmail: "" };
}

// Fecha local de hoy en formato AAAA-MM-DD (no UTC).
export function todayYMD(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Orden: fecha, luego hora (las de todo el día primero), luego título.
export function byWhen(a, b) {
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
    (a.dueTime || "").localeCompare(b.dueTime || "") ||
    String(a.title || "").localeCompare(String(b.title || ""));
}

// Llamadas al backend de Google Calendar con la sesión de Firebase.
export async function googleApi(path, { method = "GET", body } = {}) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${API_BASE}/google/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token || ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw new Error(out.error || `HTTP ${r.status}`);
  return out;
}

// Estado de la conexión con Google Calendar (y función para volver a consultarlo).
export function useGoogleStatus() {
  const [status, setStatus] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    googleApi("status").then((s) => alive && setStatus(s)).catch((e) => alive && setStatus({ error: e.message }));
    return () => { alive = false; };
  }, [tick]);
  return [status, () => setTick((n) => n + 1)];
}
