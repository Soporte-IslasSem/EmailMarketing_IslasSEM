// Tras registrarse o entrar (email o Google): ¿este email tiene acceso a la app?
// Si no, se cierra la sesión (y el servidor borra la cuenta si se acaba de crear).
// Si el servidor no responde, se deja pasar: la puerta de acceso y las reglas lo frenan igual.
import { signOut } from "firebase/auth";
import { auth } from "../../config/firebaseConfig";

const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";
export const NO_ACCESS_MSG = "Este email no tiene acceso a ISLAS SEM. Si trabajas con nosotros, pide a un administrador que te dé de alta y vuelve a intentarlo.";

export async function ensureAllowed(user) {
  try {
    const res = await fetch(`${API_BASE}/access/check`, { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!res.ok) return true;
    const { allowed } = await res.json();
    if (allowed) return true;
  } catch {
    return true;
  }
  await signOut(auth).catch(() => {});
  return false;
}
