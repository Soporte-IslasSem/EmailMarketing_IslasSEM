// WhatsApp: la app lee chats y mensajes en tiempo real (Firestore) y todo lo que escribe
// (enviar, asignar, archivar, ligar, ajustes) pasa por el servidor.
import { auth } from "../../../config/firebaseConfig";

const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";

export async function waApi(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${API_BASE}/whatsapp/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token || ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw new Error(out.error || (r.status === 413 ? "El archivo es demasiado grande (máx. 16 MB)" : `Error ${r.status}`));
  return out;
}

export const WINDOW_MS = 24 * 3600e3;
export const inWindow = (chat) => !!chat?.lastInboundAt && Date.now() - chat.lastInboundAt < WINDOW_MS;

export const chatName = (c) => c?.contactName || c?.profileName || c?.phone || "";

// "14:05" hoy, "ayer", "lun" esta semana, "12/10/26" antes.
export function shortTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "ayer";
  if (days < 7) return d.toLocaleDateString("es-ES", { weekday: "short" });
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
export const dayLabel = (ms) => new Date(ms).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const hourLabel = (ms) => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

export const STATUS_ICON = { pending: "🕓", sent: "✓", delivered: "✓✓", read: "✓✓", failed: "⚠" };
