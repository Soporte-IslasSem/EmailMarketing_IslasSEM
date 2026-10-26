// Llamadas al servidor (/api) con la sesión del usuario.
import { auth } from "../config/firebaseConfig";

export const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";

// GET si no hay cuerpo; POST con JSON si lo hay. Lanza un Error con el mensaje del servidor.
export async function api(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${API_BASE}/${path.replace(/^\//, "")}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token || ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw new Error(out.error || `Error ${r.status}`);
  return out;
}

// Archivo → base64 (sin el prefijo data:…).
export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(file);
});
