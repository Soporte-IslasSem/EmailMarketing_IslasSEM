// Configuración de la sección WhatsApp (waConfig/main), la que ve y usa todo el equipo:
// embudos y sus columnas, reglas de entrada, equipos, asignación automática, ausencias,
// etiquetas, respuestas rápidas, auto respuestas (bienvenida, cierre, fuera de horario) y
// chatbot. La app la lee en tiempo real; los cambios entran por aquí (POST /whatsapp/config)
// y se validan: solo un administrador cambia la configuración común; cada uno gestiona sus
// respuestas rápidas y su estado (disponible / ausente).
const crypto = require("crypto");
const { db } = require("./firebase");
const { DEFAULT_ORG_ID, norm } = require("./link");

const REF = () => db.collection("waConfig").doc("main");
const clip = (s, n = 200) => String(s ?? "").trim().slice(0, n);
const newId = () => crypto.randomBytes(5).toString("hex");
const cleanId = (s) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
const bool = (v) => v === true;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULT_DAYS = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { on: d >= 1 && d <= 5, from: "09:00", to: "17:00" }]));
const DEFAULTS = {
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

let cache = null;
async function getConfig(fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < 15e3) return cache.c;
  const d = (await REF().get()).data() || {};
  const c = { ...DEFAULTS, ...d, autoReply: { ...DEFAULTS.autoReply, ...(d.autoReply || {}) }, chatbot: { ...DEFAULTS.chatbot, ...(d.chatbot || {}) } };
  if (!Array.isArray(c.funnels) || !c.funnels.length) c.funnels = DEFAULTS.funnels;
  cache = { at: Date.now(), c };
  return c;
}

/* ------------------------------------------------------------------ ayudas */

const favorite = (c) => c.funnels.find((f) => f.id === c.favoriteFunnelId) || c.funnels[0];
// "embudo:columna" → { funnelId, stageId } si existe.
function parseStage(c, ref) {
  const [fid, sid] = String(ref || "").split(":");
  const f = c.funnels.find((x) => x.id === fid);
  return f && f.stages.some((s) => s.id === sid) ? { funnelId: fid, stageId: sid } : null;
}
const firstStage = (c, f = favorite(c)) => (f?.stages?.[0] ? { funnelId: f.id, stageId: f.stages[0].id } : null);

// ¿Ahora estamos dentro del horario laboral? (zona horaria de la empresa)
function inHours(h, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: h.tz || "Atlantic/Canary", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  const d = h.days?.[String(wd)];
  if (!d?.on) return false;
  const hm = `${parts.hour}:${parts.minute}`;
  return hm >= d.from && hm < d.to;
}

// Personas a las que se puede asignar un chat: los empleados con email más quien tiene
// acceso a la app (Accesos / roles), 60 s en memoria.
let peopleCache = null;
async function people() {
  if (peopleCache && Date.now() - peopleCache.at < 60e3) return peopleCache.list;
  const snap = await db.collection("employees").where("orgId", "==", DEFAULT_ORG_ID).get();
  const list = snap.docs.map((d) => d.data()).filter((e) => e.email && !e.deleted && e.active !== false)
    .map((e) => ({ email: norm(e.email), name: `${e.firstName || ""} ${e.lastName || ""}`.trim() || e.email }));
  const org = (await db.collection("organizations").doc(DEFAULT_ORG_ID).get()).data() || {};
  for (const email of [...(org.accessEmails || []), ...Object.keys(org.memberRoles || {})].map(norm)) {
    if (email && !list.some((p) => p.email === email)) list.push({ email, name: email.split("@")[0] });
  }
  peopleCache = { at: Date.now(), list };
  return list;
}

// Asignación automática aleatoria: entre los miembros del equipo indicado (o de los equipos
// de la asignación automática, o de todo el personal si no hay equipos). Los ausentes solo
// entran si así se ha configurado.
async function pickAssignee(c, teamId) {
  const all = await people();
  const teams = teamId ? c.teams.filter((t) => t.id === teamId) : c.routing.teamIds?.length ? c.teams.filter((t) => c.routing.teamIds.includes(t.id)) : [];
  const members = teams.length ? new Set(teams.flatMap((t) => t.members || [])) : null;
  const team = all.filter((p) => !members || members.has(p.email));
  const pool = c.routing.includeAway ? team : team.filter((p) => !c.away?.[p.email]);
  if (!pool.length) return null;
  const p = pool[crypto.randomInt(pool.length)];
  return { assigneeEmail: p.email, assigneeName: p.name, ...(teamId ? { teamId } : teams.length === 1 ? { teamId: teams[0].id } : {}) };
}

/* ------------------------------------------------------------------ validación */

function cleanFunnels(v) {
  const seen = new Set();
  const out = (Array.isArray(v) ? v : []).slice(0, 30).map((f) => {
    let id = cleanId(f?.id) || newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const ss = new Set();
    const stages = (Array.isArray(f?.stages) ? f.stages : []).slice(0, 20).map((s) => {
      let sid = cleanId(s?.id) || newId();
      if (ss.has(sid)) sid = newId();
      ss.add(sid);
      return { id: sid, name: clip(s?.name, 60) || "Columna" };
    });
    return { id, name: clip(f?.name, 60) || "Embudo", stages: stages.length ? stages : [{ id: newId(), name: "Nuevos chats" }] };
  });
  if (!out.length) throw Object.assign(new Error("Tiene que haber al menos un embudo"), { status: 400 });
  return out;
}
const cleanText = (v, n = 1024) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

const SECTIONS = {
  funnels: (v, c) => {
    const funnels = cleanFunnels(v.funnels);
    const favoriteFunnelId = funnels.some((f) => f.id === v.favoriteFunnelId) ? v.favoriteFunnelId : funnels[0].id;
    const tmp = { ...c, funnels };
    const entry = {
      existingStage: parseStage(tmp, v.entry?.existingStage) ? String(v.entry.existingStage) : "",
      reentryDays: Math.max(0, Math.min(365, Math.round(Number(v.entry?.reentryDays) || 0))),
    };
    return { funnels, favoriteFunnelId, entry };
  },
  teams: (v) => {
    const teams = (Array.isArray(v.teams) ? v.teams : []).slice(0, 30).map((t) => ({
      id: cleanId(t?.id) || newId(), name: clip(t?.name, 60) || "Equipo",
      members: [...new Set((Array.isArray(t?.members) ? t.members : []).map(norm).filter((e) => /@/.test(e)))].slice(0, 100),
    }));
    const ids = teams.map((t) => t.id);
    const routing = { enabled: bool(v.routing?.enabled), includeAway: bool(v.routing?.includeAway), teamIds: (v.routing?.teamIds || []).filter((x) => ids.includes(x)) };
    return { teams, routing };
  },
  tags: (v) => ({
    tags: (Array.isArray(v.tags) ? v.tags : []).slice(0, 60).map((t) => ({
      id: cleanId(t?.id) || newId(), name: clip(t?.name, 40) || "Etiqueta", color: /^#[0-9a-f]{6}$/i.test(t?.color) ? t.color : "#0e7c7b",
    })),
  }),
  autoReply: (v) => {
    const a = v.autoReply || {};
    const days = {};
    for (const d of ["0", "1", "2", "3", "4", "5", "6"]) {
      const x = a.hours?.days?.[d] || {};
      const from = HHMM.test(x.from) ? x.from : "09:00";
      const to = HHMM.test(x.to) ? x.to : "17:00";
      days[d] = { on: bool(x.on), from, to: to > from ? to : "23:59" };
    }
    let tz = clip(a.hours?.tz, 60) || "Atlantic/Canary";
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { tz = "Atlantic/Canary"; }
    return {
      autoReply: {
        welcome: { enabled: bool(a.welcome?.enabled), text: cleanText(a.welcome?.text) },
        closing: { enabled: bool(a.closing?.enabled), minutes: Math.max(0, Math.min(1440, Math.round(Number(a.closing?.minutes) || 0))), text: cleanText(a.closing?.text) },
        hours: { enabled: bool(a.hours?.enabled), tz, days, text: cleanText(a.hours?.text), everyHours: Math.max(1, Math.min(168, Math.round(Number(a.hours?.everyHours) || 12))) },
      },
    };
  },
  chatbot: (v, c) => {
    const b = v.chatbot || {};
    const teamIds = c.teams.map((t) => t.id);
    const tagIds = c.tags.map((t) => t.id);
    const options = (Array.isArray(b.options) ? b.options : []).slice(0, 10).map((o) => ({
      id: cleanId(o?.id) || newId(), label: clip(o?.label, 24) || "Opción", description: clip(o?.description, 72),
      reply: cleanText(o?.reply), teamId: teamIds.includes(o?.teamId) ? o.teamId : "",
      assigneeEmail: /@/.test(o?.assigneeEmail || "") ? norm(o.assigneeEmail) : "",
      stage: parseStage(c, o?.stage) ? String(o.stage) : "", tagId: tagIds.includes(o?.tagId) ? o.tagId : "",
    }));
    return { chatbot: { enabled: bool(b.enabled) && options.length > 0, text: cleanText(b.text) || "¡Hola! ¿En qué podemos ayudarte? Elige una opción:", button: clip(b.button, 20) || "Ver opciones", options } };
  },
  general: (v) => ({ defaultCountry: String(v.defaultCountry || "34").replace(/\D/g, "").slice(0, 4) || "34" }),
};

// POST /whatsapp/config { section, value } (las rutas comprueban la sesión antes)
async function saveConfig(user, admin, section, value) {
  const email = norm(user.email);
  const c = await getConfig(true);
  let patch;
  if (section === "presence") {
    const away = { ...(c.away || {}) };
    if (value?.away) away[email] = true; else delete away[email];
    patch = { away };
  } else if (section === "quickReply") {
    // Cada uno crea y cambia las suyas; el administrador, todas.
    const list = [...(c.quickReplies || [])];
    const v = value || {};
    const i = list.findIndex((q) => q.id === v.id);
    if (i >= 0 && list[i].ownerEmail !== email && !admin) throw Object.assign(new Error("Esa respuesta rápida es de otra persona"), { status: 403 });
    if (v.delete) { if (i >= 0) list.splice(i, 1); } else {
      const item = {
        id: i >= 0 ? list[i].id : newId(), title: clip(v.title, 60) || "Respuesta", text: cleanText(v.text, 4096),
        shared: bool(v.shared), ownerEmail: i >= 0 ? list[i].ownerEmail : email, ownerName: i >= 0 ? list[i].ownerName : clip(user.name || email, 80),
      };
      if (!item.text) throw Object.assign(new Error("Escribe el texto de la respuesta"), { status: 400 });
      if (i >= 0) list[i] = item; else list.push(item);
    }
    if (list.length > 300) throw Object.assign(new Error("Demasiadas respuestas rápidas"), { status: 400 });
    patch = { quickReplies: list };
  } else {
    if (!admin) throw Object.assign(new Error("Solo un administrador puede cambiar esta configuración"), { status: 403 });
    const fn = SECTIONS[section];
    if (!fn) throw Object.assign(new Error("Sección desconocida"), { status: 400 });
    patch = fn(value || {}, c);
  }
  // mergeFields: cada campo se sustituye entero (merge mezclaría mapas y no borraría claves).
  const data = { ...patch, orgId: DEFAULT_ORG_ID, updatedAt: Date.now(), updatedBy: email };
  await REF().set(data, { mergeFields: Object.keys(data) });
  cache = null;
  return patch;
}

module.exports = { getConfig, saveConfig, favorite, parseStage, firstStage, inHours, people, pickAssignee, DEFAULTS };
