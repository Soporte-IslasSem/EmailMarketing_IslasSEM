// ¿Este usuario puede usar la app y de qué empresa es? Lo decide el servidor (/api/access/check),
// que además deja su perfil apuntando a su empresa (users/{uid}.orgId).
// Tras registrarse o entrar (email o Google): si no tiene acceso, se cierra la sesión (y el
// servidor borra la cuenta si se acaba de crear sin dar de alta una empresa).
// Si el servidor no responde, se deja pasar: la puerta de acceso y las reglas lo frenan igual.
import { signOut } from "firebase/auth";
import { auth } from "../../config/firebaseConfig";

const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";
export const NO_ACCESS_MSG = "Este email no tiene acceso a ninguna empresa. Si trabajas en una, pide a su administrador que te dé de alta y vuelve a intentarlo.";

// → { allowed, orgId, orgName, status, isAdmin, platformAdmin, features, canCreateOrg } o null si no responde.
export async function fetchAccess(user, { signup = false } = {}) {
  try {
    const res = await fetch(`${API_BASE}/access/check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(signup ? { signup: true } : {}),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Al entrar: true si puede seguir (tiene empresa, o está dando de alta la suya).
export async function ensureAllowed(user, opts) {
  const r = await fetchAccess(user, opts);
  if (!r || r.orgId || r.canCreateOrg) return true;
  await signOut(auth).catch(() => {});
  return false;
}
