// Llamadas al servidor de la app para los contratos (la app no lee ni escribe estas
// colecciones directamente: todo pasa por el servidor, que comprueba el acceso).
import { auth } from "../../../config/firebaseConfig";

export const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";

export async function contractsApi(path, body, { method } = {}) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${API_BASE}/contracts/${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${token || ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) {
    const e = new Error(out.error || (r.status === 413 ? "El archivo es demasiado grande" : `Error ${r.status}`));
    e.missing = out.missing || [];
    throw e;
  }
  return out;
}

// Rutas públicas (enlace de firma y verificación): sin sesión.
export async function publicApi(path, body) {
  const r = await fetch(`${API_BASE}/contracts/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw new Error(out.error || `Error ${r.status}`);
  return out;
}

export const toBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
  fr.onerror = () => reject(new Error("No se pudo leer el archivo"));
  fr.readAsDataURL(file);
});

export const STATUS = {
  sent: { label: "Enviado", cls: "info" },
  viewed: { label: "Recibido", cls: "warn" },
  completed: { label: "Firmado", cls: "ok" },
  cancelled: { label: "Anulado", cls: "" },
  baja: { label: "De baja", cls: "" },
};
// Estado que se enseña: "De baja" manda sobre el resto (el contrato se conserva tal cual).
export const statusOf = (c) => (c.baja ? "baja" : c.status);
export const fmtDay = (ms) => (ms ? new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

// Dar de baja (pide el motivo). Devuelve true si se hizo.
export async function darDeBaja(c) {
  const signed = c.status === "completed";
  const reason = window.prompt(`Dar de baja "${c.title}" (${c.code}).\n\nNo se borra: se conserva con su PDF${signed ? " firmado" : ""} al menos 10 años${signed ? "" : " y el enlace de firma deja de funcionar"}.\n\nMotivo de la baja:`);
  if (reason === null) return false;
  if (reason.trim().length < 3) { alert("Escribe el motivo de la baja."); return false; }
  try { await contractsApi("baja", { id: c.id, reason: reason.trim() }); return true; } catch (e) { alert(e.message); return false; }
}
export const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

// Abre el PDF de un contrato (firmado u original) con un enlace temporal.
export async function openContractFile(id, i, which = "signed") {
  const w = window.open("", "_blank"); // se abre ya (si no, el navegador lo bloquea tras esperar)
  try {
    const { url } = await contractsApi("file-url", { id, i, which });
    if (w) w.location.href = url; else window.location.href = url;
  } catch (e) {
    w?.close();
    alert("No se pudo abrir: " + e.message);
  }
}
