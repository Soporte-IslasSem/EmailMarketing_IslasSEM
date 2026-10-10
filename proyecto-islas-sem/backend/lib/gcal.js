// Google Calendar ⇄ Tareas del CRM.
//
// Hay dos clases de calendario conectado:
// - El de la empresa (grupo@/marketing@): lo conecta un administrador. Estado en
//   system/googleCalendar. Las citas que llegan se asignan a quien elija el administrador.
// - El de cada trabajador (su cuenta @islassem.com): lo conecta cada uno desde Tareas.
//   Estado en system/gcal_user_<uid>. Sus citas llegan como tareas asignadas a él, y las
//   tareas que se le asignan con hora se publican en su calendario.
// Los refresh tokens están en la colección system, que las reglas de Firestore no dejan
// leer desde la app: solo el servidor los usa.
//
// - Google → app (cron, cada ~2 min por calendario): las citas se convierten en tareas
//   (activities) con fecha, hora, invitados y Meet. Si cambian o se cancelan en Google,
//   la tarea se actualiza o desaparece. Sincronización incremental con syncToken.
// - App → Google: una tarea con hora se publica como cita (POST /api/google/events) en el
//   calendario de la persona asignada (si lo conectó) o en el de la empresa.
//
// .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (cliente OAuth "Aplicación web" con la URI
// de redirección https://email-marketing.islassem.com/api/google/callback).
const crypto = require("crypto");
const { admin, db } = require("./firebase");
const { DEFAULT_ORG_ID, norm, resolvePerson } = require("./link");

const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
const REDIRECT_URI = `${PUBLIC_URL}/api/google/callback`;
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
const DEFAULT_TZ = "Atlantic/Canary";
const OWN_DOMAIN = "islassem.com";
const ADMIN_ROLES = ["Full access", "Administrador"];
const SYNC_EVERY_MS = 110e3;
const FV = admin.firestore.FieldValue;
const COMPANY = "company";
const stateRef = () => db.collection("system").doc("googleCalendar");
const userRef = (uid) => db.collection("system").doc(`gcal_user_${uid}`);
// Calendario = { key, ref }. key "company" o "u_<uid>" (se guarda en la tarea como googleCal).
const companyCal = () => ({ key: COMPANY, ref: stateRef() });
const userCal = (uid) => ({ key: `u_${uid}`, ref: userRef(uid) });
const calOf = (key) => (!key || key === COMPANY ? companyCal() : userCal(String(key).slice(2)));

const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// ---------------------------------------------------------------- permisos

// Usuario de la app (token de Firebase) que pertenece a la organización.
async function authUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const user = await admin.auth().verifyIdToken(token).catch(() => null);
  if (!user) return null;
  const prof = await db.collection("users").doc(user.uid).get().catch(() => null);
  const orgId = prof?.exists ? prof.data().orgId : null;
  if (orgId !== DEFAULT_ORG_ID) return null;
  return { uid: user.uid, email: norm(user.email), orgId };
}

// Igual que en la app: administradores = empleados con rol "Full access"/"Administrador".
// Mientras no haya ninguno marcado, cualquier usuario de la organización lo es.
async function isAdmin(u) {
  const snap = await db.collection("employees").where("orgId", "==", u.orgId).get();
  const admins = snap.docs.map((d) => d.data()).filter((e) => ADMIN_ROLES.includes(e.role));
  return !admins.length || admins.some((e) => norm(e.email) === u.email);
}

async function guard(req, res, { adminOnly = false } = {}) {
  const u = await authUser(req);
  if (!u) { res.status(401).json({ ok: false, error: "Sesión no válida" }); return null; }
  if (adminOnly && !(await isAdmin(u))) { res.status(403).json({ ok: false, error: "Solo un administrador puede hacer esto" }); return null; }
  return u;
}

// ---------------------------------------------------------------- OAuth / API

async function tokenRequest(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error_description || data.error || `Google token HTTP ${r.status}`);
  return data;
}

const cachedAccess = new Map(); // key -> { token, exp }
async function accessToken(cal) {
  const c = cachedAccess.get(cal.key);
  if (c && c.exp > Date.now() + 60e3) return c.token;
  const st = (await cal.ref.get()).data();
  if (!st?.refreshToken) throw new Error("Google Calendar no está conectado");
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: st.refreshToken });
    cachedAccess.set(cal.key, { token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 });
    return t.access_token;
  } catch (e) {
    // Permiso revocado en Google: se marca para que la app pida reconectar.
    if (/invalid_grant/i.test(e.message)) await cal.ref.set({ needsReconnect: true, lastError: "Google retiró el permiso: vuelve a conectar." }, { merge: true });
    throw e;
  }
}

async function gapi(cal, path, { method = "GET", query, body } = {}) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(cal)}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return {};
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(data.error?.message || `Google Calendar HTTP ${r.status}`); err.status = r.status; throw err; }
  return data;
}

// POST /api/google/connect { scope: "company" | "me" } → { url } de consentimiento de Google.
// El de la empresa solo lo conecta un administrador; el propio, cualquier usuario.
async function connect(req, res) {
  try {
    if (!configured()) return res.status(503).json({ ok: false, error: "Falta configurar GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en el servidor." });
    const scope = req.body?.scope === "me" ? "me" : COMPANY;
    const u = await guard(req, res, { adminOnly: scope === COMPANY });
    if (!u) return;
    const state = crypto.randomBytes(24).toString("hex");
    await db.collection("system").doc(`googleOAuthState_${state}`).set({ state, scope, uid: u.uid, email: u.email, exp: Date.now() + 10 * 60e3 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code",
      scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true",
      login_hint: scope === "me" ? u.email : process.env.GOOGLE_CALENDAR_ACCOUNT || "grupo@islassem.com", state,
    }).toString();
    res.json({ ok: true, url: url.toString() });
  } catch (e) {
    console.error("[google/connect]", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
}

// GET /api/google/callback?code&state (vuelve de Google)
async function callback(req, res) {
  const back = (q) => res.redirect(302, `${PUBLIC_URL}/dashboard/tasks?google=${q}`);
  try {
    if (req.query.error) return back("cancelado");
    const state = String(req.query.state || "");
    if (!/^[0-9a-f]{48}$/.test(state)) return back("caducado");
    const sref = db.collection("system").doc(`googleOAuthState_${state}`);
    const s = (await sref.get()).data();
    if (!s || s.state !== state || s.exp < Date.now()) return back("caducado");
    await sref.delete();
    const t = await tokenRequest({ grant_type: "authorization_code", code: String(req.query.code || ""), redirect_uri: REDIRECT_URI });
    if (!t.refresh_token) return back("sin-permiso");
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
    const cal = s.scope === "me" ? userCal(s.uid) : companyCal();
    cachedAccess.set(cal.key, { token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 });
    await cal.ref.set({
      refreshToken: t.refresh_token, account: norm(info.email), calendarId: "primary",
      connectedAt: Date.now(), connectedBy: s.email, syncToken: FV.delete(), needsReconnect: false, lastError: FV.delete(),
      ...(s.scope === "me" ? { kind: "gcalUser", uid: s.uid, email: s.email, orgId: DEFAULT_ORG_ID } : {}),
    }, { merge: true });
    syncOne(cal, { force: true }).catch((e) => console.warn("[gcal] primera sync:", e.message));
    back("ok");
  } catch (e) {
    console.error("[google/callback]", e);
    back("error");
  }
}

// GET /api/google/status — lo que la app muestra (nunca el token).
async function status(req, res) {
  const u = await guard(req, res);
  if (!u) return;
  const st = (await stateRef().get()).data() || {};
  const mine = (await userRef(u.uid).get()).data() || {};
  const admin = await isAdmin(u);
  const brief = (x) => ({ connected: !!x.refreshToken && !x.needsReconnect, account: x.account || "", lastSyncAt: x.lastSyncAt || null, lastError: x.lastError || "" });
  // El administrador ve qué trabajadores tienen su calendario conectado.
  const people = admin
    ? (await db.collection("system").where("kind", "==", "gcalUser").get()).docs
      .map((d) => d.data()).filter((x) => x.refreshToken).map((x) => ({ email: x.email || "", ...brief(x) }))
    : [];
  res.json({
    ok: true, configured: configured(), connected: !!st.refreshToken && !st.needsReconnect,
    account: st.account || "", lastSyncAt: st.lastSyncAt || null, lastError: st.lastError || "",
    events: st.lastCount ?? null, defaultAssignee: st.defaultAssignee || null, isAdmin: admin,
    me: { email: u.email, ...brief(mine) }, people,
  });
}

// POST /api/google/settings { defaultAssignee: {type,id,name,email} | null }
async function settings(req, res) {
  const u = await guard(req, res, { adminOnly: true });
  if (!u) return;
  const a = req.body?.defaultAssignee;
  const clean = a && ["person", "team"].includes(a.type) && a.id
    ? { type: a.type, id: String(a.id).slice(0, 64), name: String(a.name || "").slice(0, 120), email: norm(a.email).slice(0, 200) }
    : null;
  await stateRef().set({ defaultAssignee: clean }, { merge: true });
  res.json({ ok: true });
}

// POST /api/google/disconnect { scope: "company" | "me" }
async function disconnect(req, res) {
  const scope = req.body?.scope === "me" ? "me" : COMPANY;
  const u = await guard(req, res, { adminOnly: scope === COMPANY });
  if (!u) return;
  const cal = scope === "me" ? userCal(u.uid) : companyCal();
  const st = (await cal.ref.get()).data();
  if (st?.refreshToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(st.refreshToken)}`, { method: "POST" }).catch(() => {});
  }
  cachedAccess.delete(cal.key);
  await cal.ref.set({ refreshToken: FV.delete(), syncToken: FV.delete(), account: "", needsReconnect: false, lastError: FV.delete() }, { merge: true });
  res.json({ ok: true });
}

// ---------------------------------------------------------------- fechas

function localParts(iso, tz) {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
function addMinutes(date, time, mins) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(Date.UTC(...date.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), h, m + mins));
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

// ---------------------------------------------------------------- Google → app

const stripHtml = (s) => String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

async function upsertEvent(ev, tz, defaultAssignee, calKey = COMPANY) {
  // La misma cita puede estar en varios calendarios (empresa y trabajadores invitados):
  // cada calendario solo toca su tarea, y no se crea una segunda si ya existe en otro.
  const found = (await db.collection("activities").where("googleEventId", "==", ev.id).get()).docs;
  const own = found.find((d) => (d.data().googleCal || COMPANY) === calKey);
  if (!own && found.length) return "skip";
  const ref = own ? own.ref : db.collection("activities").doc(calKey === COMPANY ? `gcal_${ev.id}` : `gcal_${calKey}_${ev.id}`);
  const prev = own ? own.data() : null;
  const fromApp = prev && prev.source !== "google";

  if (ev.status === "cancelled") {
    if (!prev) return "skip";
    if (fromApp) await ref.update({ googleEventId: FV.delete(), googleLink: FV.delete(), googleCancelled: true });
    else await ref.delete();
    return "deleted";
  }

  const allDay = !!ev.start?.date;
  const start = allDay ? { date: ev.start.date, time: "" } : localParts(ev.start?.dateTime, ev.start?.timeZone || tz);
  const end = allDay ? { time: "" } : localParts(ev.end?.dateTime || ev.start?.dateTime, ev.end?.timeZone || tz);
  const guests = (ev.attendees || []).filter((a) => !a.self && !a.resource)
    .map((a) => ({ email: norm(a.email), name: a.displayName || "", status: a.responseStatus || "" }));
  const meet = ev.hangoutLink || (ev.conferenceData?.entryPoints || []).find((x) => x.entryPointType === "video")?.uri || "";
  const common = {
    title: ev.summary || "(Cita sin título)", dueDate: start.date, dueTime: start.time, endTime: end.time, allDay,
    location: ev.location || "", meetLink: meet, googleLink: ev.htmlLink || "", googleEventId: ev.id, googleUpdated: ev.updated || "",
    attendees: guests, googleCal: calKey, updatedAt: new Date(),
  };
  if (fromApp) {
    await ref.update(common); // cambios hechos en Google sobre una tarea creada en la app
    return "updated";
  }

  // Quien reserva (invitado externo) se vincula a su ficha o entra como prospecto.
  let person = { contactId: prev?.contactId || "", leadId: prev?.leadId || "" };
  const booker = guests.find((g) => g.email && !g.email.endsWith(`@${OWN_DOMAIN}`));
  if (!prev && booker) {
    const [firstName, ...rest] = (booker.name || "").split(" ");
    const r = await resolvePerson(DEFAULT_ORG_ID, {
      email: booker.email, firstName, lastName: rest.join(" "), source: "Google Calendar",
      notes: `Reservó una cita: "${(ev.summary || "").slice(0, 120)}"`,
    }).catch(() => null);
    if (r) person = { contactId: r.contactId, leadId: r.leadId };
  }

  await ref.set({
    orgId: DEFAULT_ORG_ID, type: "Reunión", source: "google", body: stripHtml(ev.description).slice(0, 4000),
    ...common,
    contactId: person.contactId || "", leadId: person.leadId || "",
    entity: person.leadId ? "lead" : person.contactId ? "contact" : null, entityId: person.leadId || person.contactId || null,
    ...(prev ? {} : {
      done: false, auto: true, priority: "Media", createdAt: new Date(),
      ...(defaultAssignee ? { assigneeType: defaultAssignee.type, assigneeId: defaultAssignee.id, assigneeName: defaultAssignee.name, assigneeEmail: defaultAssignee.email || "" } : {}),
    }),
  }, { merge: true });
  return prev ? "updated" : "created";
}

// Trabajador dueño de un calendario personal → asignación de sus citas.
async function ownerAssignee(st) {
  const email = norm(st.email);
  const emp = (await db.collection("employees").where("orgId", "==", DEFAULT_ORG_ID).get()).docs
    .find((d) => norm(d.data().email) === email);
  const name = emp ? `${emp.data().firstName || ""} ${emp.data().lastName || ""}`.trim() : "";
  return { type: "person", id: emp?.id || "", name: name || email, email };
}

// Sincroniza todos los calendarios conectados (empresa + trabajadores).
async function syncCalendar({ force = false } = {}) {
  if (!configured()) return { skipped: "sin configurar" };
  const out = { company: await syncOne(companyCal(), { force }).catch((e) => ({ error: String(e.message || e).slice(0, 200) })) };
  const users = (await db.collection("system").where("kind", "==", "gcalUser").get()).docs;
  for (const d of users) {
    const r = await syncOne(userCal(d.data().uid), { force }).catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
    if (!r.skipped) out[d.data().email || d.id] = r;
  }
  return out;
}

// Sincroniza un calendario (incremental). En el cron se limita a una vez cada ~2 min.
async function syncOne(cal, { force = false } = {}) {
  if (!configured()) return { skipped: "sin configurar" };
  const sref = cal.ref;
  const st = (await sref.get()).data();
  if (!st?.refreshToken || st.needsReconnect) return { skipped: "no conectado" };
  if (!force && st.lastSyncAt && Date.now() - st.lastSyncAt < SYNC_EVERY_MS) return { skipped: "reciente" };
  await sref.set({ lastSyncAt: Date.now() }, { merge: true });

  const counts = { created: 0, updated: 0, deleted: 0 };
  try {
    let syncToken = st.syncToken || "";
    let pageToken = "";
    let tz = DEFAULT_TZ;
    let nextSyncToken = "";
    const base = syncToken
      ? { syncToken }
      : { timeMin: new Date(Date.now() - 7 * 864e5).toISOString(), singleEvents: "true" };
    const assignee = cal.key === COMPANY ? st.defaultAssignee || null : await ownerAssignee(st);
    for (let page = 0; page < 20; page++) {
      let data;
      try {
        data = await gapi(cal, `calendars/${encodeURIComponent(st.calendarId || "primary")}/events`, {
          query: { ...base, showDeleted: "true", maxResults: 250, pageToken },
        });
      } catch (e) {
        if (e.status === 410 && syncToken) { // syncToken caducado: sincronización completa
          await sref.set({ syncToken: FV.delete() }, { merge: true });
          return syncOne(cal, { force: true });
        }
        throw e;
      }
      tz = data.timeZone || tz;
      for (const ev of data.items || []) {
        if (!ev.start && ev.status !== "cancelled") continue;
        const r = await upsertEvent(ev, tz, assignee, cal.key);
        if (counts[r] !== undefined) counts[r]++;
      }
      if (data.nextPageToken) { pageToken = data.nextPageToken; continue; }
      nextSyncToken = data.nextSyncToken || "";
      break;
    }
    await sref.set({ ...(nextSyncToken ? { syncToken: nextSyncToken } : {}), timeZone: tz, lastError: FV.delete(), lastCount: counts.created + counts.updated }, { merge: true });
    return counts;
  } catch (e) {
    await sref.set({ lastError: String(e.message || e).slice(0, 300) }, { merge: true });
    throw e;
  }
}

// ---------------------------------------------------------------- app → Google

const connected = async (cal) => { const st = (await cal.ref.get()).data(); return st?.refreshToken && !st.needsReconnect ? cal : null; };

// Calendario donde va la cita: el que ya tenga; si no, el de la persona asignada; si no,
// el de la empresa; y como último recurso el de quien la publica.
async function pickCalendar(a, u) {
  if (a.googleEventId) return connected(calOf(a.googleCal));
  if (a.assigneeType === "person" && a.assigneeEmail) {
    const d = (await db.collection("system").where("kind", "==", "gcalUser").where("email", "==", norm(a.assigneeEmail)).limit(1).get()).docs[0];
    const c = d && (await connected(userCal(d.data().uid)));
    if (c) return c;
  }
  return (await connected(companyCal())) || connected(userCal(u.uid));
}

// POST /api/google/events { activityId } — crea o actualiza la cita de una tarea con hora.
async function pushEvent(req, res) {
  try {
    const u = await guard(req, res);
    if (!u) return;
    const id = String(req.body?.activityId || "").slice(0, 120);
    const ref = db.collection("activities").doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().orgId !== u.orgId) return res.status(404).json({ ok: false, error: "Tarea no encontrada" });
    const a = snap.data();
    if (!YMD.test(a.dueDate || "") || !HHMM.test(a.dueTime || "")) return res.status(400).json({ ok: false, error: "La tarea necesita fecha y hora" });
    const cal = await pickCalendar(a, u);
    if (!cal) return res.status(409).json({ ok: false, error: "No hay ningún Google Calendar conectado (ni el de la persona asignada ni el de la empresa)." });
    const st = (await cal.ref.get()).data() || {};
    const tz = st.timeZone || DEFAULT_TZ;
    const endTime = HHMM.test(a.endTime || "") && a.endTime > a.dueTime ? { date: a.dueDate, time: a.endTime } : addMinutes(a.dueDate, a.dueTime, 60);
    const body = {
      summary: a.title || "Tarea",
      description: `${a.body ? `${a.body}\n\n` : ""}Creada desde ISLAS SEM${a.assigneeName ? ` · Asignada a ${a.assigneeName}` : ""}`,
      start: { dateTime: `${a.dueDate}T${a.dueTime}:00`, timeZone: tz },
      end: { dateTime: `${endTime.date}T${endTime.time}:00`, timeZone: tz },
      ...(a.location ? { location: a.location } : {}),
    };
    const calId = encodeURIComponent(st.calendarId || "primary");
    let ev;
    if (a.googleEventId) {
      try { ev = await gapi(cal, `calendars/${calId}/events/${encodeURIComponent(a.googleEventId)}`, { method: "PATCH", body }); }
      catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
    }
    if (!ev) ev = await gapi(cal, `calendars/${calId}/events`, { method: "POST", body });
    await ref.update({ googleEventId: ev.id, googleCal: cal.key, googleLink: ev.htmlLink || "", googleUpdated: ev.updated || "", googleCancelled: FV.delete() });
    res.json({ ok: true, link: ev.htmlLink || "" });
  } catch (e) {
    console.error("[google/events]", e);
    res.status(e.status === 401 || /no está conectado|retiró/.test(e.message) ? 409 : 500).json({ ok: false, error: e.message || "Error con Google Calendar" });
  }
}

module.exports = { connect, callback, status, settings, disconnect, pushEvent, syncCalendar, localParts, addMinutes, isAdmin };
