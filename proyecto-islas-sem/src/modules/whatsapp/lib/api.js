// WhatsApp: la app lee chats, mensajes, configuración, plantillas y difusiones de SU empresa en
// tiempo real (Firestore, organizations/{orgId}/…) y todo lo que escribe (enviar, asignar, mover,
// archivar, ajustes…) pasa por el servidor.
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../../../config/firebaseConfig";
import { useCrmCollection } from "../../crm/lib/crm";
import { usePerms } from "../../crm/lib/permissions";
import { useOrg } from "../../crm/lib/useOrg";

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
// Tiempo que queda de la ventana de 24 h ("23 h", "40 min").
export function windowLeft(chat) {
  if (!inWindow(chat)) return "";
  const ms = WINDOW_MS - (Date.now() - chat.lastInboundAt);
  return ms > 3600e3 ? `${Math.floor(ms / 3600e3)} h` : `${Math.max(1, Math.floor(ms / 60e3))} min`;
}

export const chatName = (c) => c?.contactName || c?.profileName || c?.phone || "";
export const initial = (c) => (chatName(c).replace(/^\+/, "")[0] || "?").toUpperCase();

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
export const dateTime = (ms) => (ms ? new Date(ms).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export const STATUS_ICON = { pending: "🕓", sent: "✓", delivered: "✓✓", read: "✓✓", failed: "⚠" };
export const STATUS_LABEL = { pending: "Enviando", sent: "Enviado", delivered: "Entregado", read: "Leído", failed: "Fallido" };

/* ------------------------------------------------------------------ configuración */

const DEFAULT_DAYS = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { on: d >= 1 && d <= 5, from: "09:00", to: "17:00" }]));
export const DEFAULT_CONFIG = {
  funnels: [{
    id: "ventas", name: "Embudo de ventas",
    stages: [{ id: "nuevos", name: "Nuevos chats" }, { id: "cualificados", name: "Cualificados" }, { id: "seguimiento", name: "Seguimiento" }, { id: "cerrados", name: "Cerrados" }],
  }],
  favoriteFunnelId: "ventas",
  entry: { existingStage: "", reentryDays: 0 },
  teams: [],
  routing: { enabled: false, teamIds: [], includeAway: false },
  away: {},
  tags: [],
  quickReplies: [],
  autoReply: {
    welcome: { enabled: false, text: "" },
    closing: { enabled: false, minutes: 15, text: "" },
    hours: { enabled: false, tz: "Atlantic/Canary", days: DEFAULT_DAYS, text: "", everyHours: 12 },
  },
  chatbot: { enabled: false, text: "", button: "Ver opciones", options: [] },
  defaultCountry: "34",
};

// Configuración común (embudos, equipos, etiquetas…) en tiempo real.
export function useWaConfig() {
  const { orgId } = useOrg();
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    if (!orgId) return undefined;
    return onSnapshot(doc(db, "organizations", orgId, "waConfig", "main"), (s) => {
      const d = s.data() || {};
      const c = { ...DEFAULT_CONFIG, ...d, autoReply: { ...DEFAULT_CONFIG.autoReply, ...(d.autoReply || {}) }, chatbot: { ...DEFAULT_CONFIG.chatbot, ...(d.chatbot || {}) } };
      if (!Array.isArray(c.funnels) || !c.funnels.length) c.funnels = DEFAULT_CONFIG.funnels;
      setCfg(c);
    }, () => setCfg(DEFAULT_CONFIG));
  }, [orgId]);
  return cfg;
}
export const saveConfig = (section, value) => waApi("config", { section, value });

export const favoriteFunnel = (cfg) => cfg.funnels.find((f) => f.id === cfg.favoriteFunnelId) || cfg.funnels[0];
export function stageLabel(cfg, chat) {
  const f = cfg?.funnels.find((x) => x.id === chat?.funnelId);
  const s = f?.stages.find((x) => x.id === chat?.stageId);
  return f && s ? `${f.name} › ${s.name}` : "";
}
export const tagOf = (cfg, id) => cfg?.tags.find((t) => t.id === id);
export const newId = () => Math.random().toString(36).slice(2, 10);

// Colección de la empresa en tiempo real (plantillas, difusiones).
export function useWaCollection(name) {
  const { orgId } = useOrg();
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!orgId) return undefined;
    return onSnapshot(collection(db, "organizations", orgId, name), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setItems([]));
  }, [name, orgId]);
  return items;
}

/* ------------------------------------------------------------------ plantillas */

const VAR = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
export const varsOf = (text) => [...new Set([...String(text || "").matchAll(VAR)].map((m) => m[1]))];
export const comp = (t, type) => (t?.components || []).find((c) => c.type === type);
export const TPL_STATUS = {
  APPROVED: ["Aprobada", "ok"], PENDING: ["En revisión", "wait"], REJECTED: ["Rechazada", "bad"], PAUSED: ["Pausada", "bad"],
  DISABLED: ["Desactivada", "bad"], IN_APPEAL: ["En apelación", "wait"], PENDING_DELETION: ["Borrándose", "bad"], LIMIT_EXCEEDED: ["Límite superado", "bad"],
};
export const CATEGORY = { MARKETING: "Marketing", UTILITY: "Utilidad", AUTHENTICATION: "Autenticación" };
export const LANGS = [["es", "Español"], ["es_ES", "Español (España)"], ["es_MX", "Español (México)"], ["en", "Inglés"], ["en_US", "Inglés (EE. UU.)"], ["en_GB", "Inglés (Reino Unido)"], ["fr", "Francés"], ["de", "Alemán"], ["it", "Italiano"], ["pt_PT", "Portugués (Portugal)"], ["pt_BR", "Portugués (Brasil)"]];
export const CONTACT_VARS = ["{nombre}", "{apellidos}", "{nombre_completo}", "{empresa}", "{email}", "{telefono}"];

// Texto de la plantilla con los valores puestos (vista previa).
export function renderTemplate(t, params = {}) {
  const put = (text, list) => varsOf(text).reduce((acc, k, i) => acc.split(`{{${k}}}`).join((Array.isArray(list) ? list[i] : list?.[k]) || `{{${k}}}`), String(text || ""));
  const h = comp(t, "HEADER");
  return {
    header: h?.format === "TEXT" ? put(h.text, params.header) : h?.format ? `[${{ IMAGE: "Imagen", VIDEO: "Vídeo", DOCUMENT: "Documento", LOCATION: "Ubicación" }[h.format] || h.format}]` : "",
    body: put(comp(t, "BODY")?.text, params.body),
    footer: comp(t, "FOOTER")?.text || "",
    buttons: (comp(t, "BUTTONS")?.buttons || []).map((b) => b.text),
  };
}

export const EMOJIS = "😀 😂 😊 😍 😘 😉 🙂 🤗 🤔 😅 😢 😭 😡 😮 😴 👍 👎 👏 🙏 💪 👋 🤝 ✌️ 👌 ❤️ 💙 💚 🔥 ⭐ ✨ 🎉 🎁 ✅ ❌ ⚠️ ❓ 📅 ⏰ 📞 📧 📍 💶 📄 📎 🚀 ☀️ 🌴 😎".split(" ");

/* ------------------------------------------------------------------ chats */

// Todos los chats (los 1000 más recientes) en tiempo real.
export function useChats() {
  const { orgId } = useOrg();
  const [chats, setChats] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!orgId) return undefined;
    return onSnapshot(
      query(collection(db, "organizations", orgId, "waChats"), orderBy("lastAt", "desc"), limit(1000)),
      (s) => { setChats(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setError(""); },
      (e) => { setChats([]); setError(e.code === "permission-denied" ? "No tienes permiso para ver los chats." : e.message); },
    );
  }, [orgId]);
  return { chats, error };
}

// Pitido corto + contador en el título de la pestaña cuando entran mensajes nuevos.
export function useUnreadAlert(chats) {
  const prev = useRef(null);
  const total = (chats || []).reduce((a, c) => a + (c.archived ? 0 : c.unread || 0), 0);
  useEffect(() => {
    if (chats === null) return;
    if (prev.current !== null && total > prev.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880; g.gain.value = 0.06;
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15);
        setTimeout(() => ctx.close(), 400);
      } catch { /* sin audio */ }
    }
    prev.current = total;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = total ? `(${total}) ${base}` : base;
    return () => { document.title = document.title.replace(/^\(\d+\) /, ""); };
  }, [total, chats]);
  return total;
}


// Lo que se manda al servidor a partir de lo elegido.
export async function templatePayload(value, toBase64) {
  const { name, language } = value;
  if (!name) throw new Error("Elige una plantilla");
  const file = value.file ? { name: value.file.name, mime: value.file.type || "application/octet-stream", data: await toBase64(value.file) } : undefined;
  if (value.file && value.file.size > 16 * 1024 * 1024) throw new Error("El archivo pasa de 16 MB");
  return { name, language, params: value.params || {}, ...(file ? { file } : {}) };
}

// Personas a las que se puede asignar un chat: empleados con email + quien tiene acceso a la
// app (Accesos / roles), sin repetir.
export function usePeople() {
  const { items } = useCrmCollection("employees");
  const { org } = usePerms();
  return useMemo(() => {
    const list = items.filter((e) => e.email && !e.deleted && e.active !== false)
      .map((e) => ({ email: e.email.toLowerCase(), name: `${e.firstName || ""} ${e.lastName || ""}`.trim() || e.email }));
    for (const email of [...(org?.accessEmails || []), ...Object.keys(org?.memberRoles || {})].map((x) => String(x).toLowerCase())) {
      if (email && !list.some((p) => p.email === email)) list.push({ email, name: email.split("@")[0] });
    }
    return list.sort((x, y) => x.name.localeCompare(y.name));
  }, [items, org]);
}

/* ------------------------------------------------------------------ país del número */

// Prefijo internacional → país (código ISO), para la bandera de cada chat. Gana el prefijo más largo.
const DIAL = {
  1: "us", 7: "ru", 20: "eg", 27: "za", 30: "gr", 31: "nl", 32: "be", 33: "fr", 34: "es", 36: "hu", 39: "it", 40: "ro", 41: "ch", 43: "at", 44: "gb",
  45: "dk", 46: "se", 47: "no", 48: "pl", 49: "de", 51: "pe", 52: "mx", 53: "cu", 54: "ar", 55: "br", 56: "cl", 57: "co", 58: "ve", 60: "my",
  61: "au", 62: "id", 63: "ph", 64: "nz", 65: "sg", 66: "th", 81: "jp", 82: "kr", 84: "vn", 86: "cn", 90: "tr", 91: "in", 92: "pk", 212: "ma",
  213: "dz", 216: "tn", 221: "sn", 225: "ci", 233: "gh", 234: "ng", 237: "cm", 238: "cv", 240: "gq", 244: "ao", 245: "gw", 254: "ke", 351: "pt",
  352: "lu", 353: "ie", 354: "is", 356: "mt", 357: "cy", 358: "fi", 359: "bg", 370: "lt", 371: "lv", 372: "ee", 373: "md", 380: "ua", 381: "rs",
  385: "hr", 386: "si", 387: "ba", 420: "cz", 421: "sk", 502: "gt", 503: "sv", 504: "hn", 505: "ni", 506: "cr", 507: "pa", 509: "ht", 591: "bo",
  593: "ec", 595: "py", 598: "uy", 971: "ae", 972: "il", 974: "qa", 966: "sa", 1809: "do", 1829: "do", 1849: "do", 1787: "pr",
};
export function countryOf(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  for (const n of [4, 3, 2, 1]) if (DIAL[d.slice(0, n)]) return DIAL[d.slice(0, n)];
  return "";
}
