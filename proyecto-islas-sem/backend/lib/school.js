// Escuela ISLAS SEM › Alumnado prácticas.
//  - Formulario público de alta (/alumnado): el alumno elige curso y rellena su CV; el servidor
//    guarda la ficha (students) y genera su currículum en PDF (sin foto) en Storage.
//  - Página pública para cada empresa de prácticas (/practicas/:token): ve SOLO los alumnos que
//    se le han asignado, abre su CV y pide entrevista. El CV no lleva email ni teléfono del alumno:
//    la entrevista se coordina a través de la escuela.
//  - El equipo (con sesión) gestiona alumnos, cursos y empresas desde la app (Firestore + reglas);
//    aquí solo: ver el CV, regenerarlo y los avisos por correo.
// Colecciones (todas con orgId): schoolCourses, students, schoolPlacements, schoolInterviews,
// y schoolSettings/{orgId} (email de avisos).
const crypto = require("crypto");
const { db, bucket } = require("./firebase");
const { staffFromReq } = require("./access");
const { DEFAULT_ORG_ID, norm, addActivity } = require("./link");
const { getOrg, brandOf, featuresOf } = require("./tenant");
const { brandMailHtml } = require("./brandMail");
const { renderPdf } = require("./pdf");
const { verifyRecaptcha } = require("./forms");

const STATUSES = ["Nuevo", "Disponible", "Asignado", "En prácticas", "Finalizado", "Descartado"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,80}$/;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const str = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
const list = (v, max, fn) => (Array.isArray(v) ? v : []).slice(0, max).map(fn).filter(Boolean);
const pct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

async function schoolOrg(orgId) {
  const org = await getOrg(orgId || DEFAULT_ORG_ID);
  return org && featuresOf(org).school ? org : null;
}
async function settingsOf(org) {
  const s = (await db.collection("schoolSettings").doc(org.id).get()).data() || {};
  const firstAdmin = (org.adminEmails || [])[0] || (org.accessEmails || [])[0] || "";
  return { notifyEmail: norm(s.notifyEmail) || firstAdmin, schoolName: str(s.schoolName) || `Escuela ${brandOf(org).name}`.trim() };
}
const queueMail = (orgId, item) => db.collection("outbox").add({
  orgId, text: "", status: item.to ? "pending" : "skipped", attempts: 0, error: item.to ? "" : "Sin email",
  sentAt: null, attachment: null, source: "school", createdAt: new Date(), updatedAt: new Date(), ...item,
});

// Antispam sencillo por IP (además de reCAPTCHA si está configurado): 6 altas / 10 min.
const hits = new Map();
function tooMany(ip, max = 6, windowMs = 10 * 60e3) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return arr.length > max;
}

/* ------------------------------------------------------------------ datos del alumno */

// Lo que llega del formulario (o de la app) → ficha limpia. Nada anidado más allá de lo previsto.
function cleanStudent(b) {
  return {
    firstName: str(b.firstName, 80), lastName: str(b.lastName, 120), email: norm(str(b.email, 160)), phone: str(b.phone, 40),
    city: str(b.city, 80), hasCar: !!b.hasCar, headline: str(b.headline, 100),
    specialties: list(b.specialties, 12, (x) => str(x, 60)),
    profile: str(b.profile, 1500),
    experience: list(b.experience, 8, (x) => {
      const e = { title: str(x?.title, 120), company: str(x?.company, 120), from: str(x?.from, 40), to: str(x?.to, 40), description: str(x?.description, 600) };
      e.bullets = list(x?.bullets, 8, (y) => str(y, 200));
      return e.title || e.company ? e : null;
    }),
    education: list(b.education, 8, (x) => {
      const e = { title: str(x?.title, 160), center: str(x?.center, 120), from: str(x?.from, 40), to: str(x?.to, 40) };
      return e.title ? e : null;
    }),
    skills: list(b.skills, 12, (x) => (str(x?.name, 50) ? { name: str(x.name, 50), level: pct(x.level) } : null)),
    competencies: list(b.competencies, 12, (x) => str(x, 50)),
    languages: list(b.languages, 6, (x) => (str(x?.name, 40) ? { name: str(x.name, 40), level: str(x.level, 30) } : null)),
  };
}

/* ------------------------------------------------------------------ CV en PDF */

function cvDefinition(s, course, brand) {
  const DARK = "#123B3A", ACC = brand.accent || "#E2B83C", MAIN = brand.color || "#136B68", INK = "#1F2A2A", MUTED = "#6B7D7D";
  const SIDE_W = 190, BAR_W = 150;
  const name = [s.firstName, s.lastName].filter(Boolean).join(" ") || "Alumno/a";
  const sideTitle = (t) => ({ text: t.toUpperCase(), color: ACC, bold: true, fontSize: 9, characterSpacing: 1.2, margin: [0, 14, 0, 6] });
  const mainTitle = (t) => ({
    columns: [{ width: 16, canvas: [{ type: "line", x1: 0, y1: 6, x2: 12, y2: 6, lineWidth: 1.2, lineColor: MAIN }] },
      { text: t.toUpperCase(), bold: true, fontSize: 10.5, characterSpacing: 1.4, color: INK }],
    margin: [0, 14, 0, 6],
  });
  const side = [
    { text: name, color: "#FFFFFF", bold: true, fontSize: 17, alignment: "center", margin: [0, 6, 0, 6] },
    s.headline || course?.name ? { table: { widths: ["*"], body: [[{ text: (s.headline || course.name).toUpperCase(), color: "#FFFFFF", bold: true, fontSize: 8, alignment: "center", fillColor: MAIN, margin: [4, 3, 4, 3] }]] }, layout: "noBorders", margin: [8, 0, 8, 0] } : null,
    sideTitle("Contacto"),
    s.city ? { text: `• ${s.city}`, color: "#DCE7E6", fontSize: 8.5, margin: [0, 0, 0, 3] } : null,
    course?.name ? { text: `• Alumno/a de ${course.name}`, color: "#DCE7E6", fontSize: 8.5, margin: [0, 0, 0, 3] } : null,
    s.specialties.length ? { text: `• ${s.specialties.join(", ")}`, color: "#DCE7E6", fontSize: 8.5, margin: [0, 0, 0, 3] } : null,
    s.hasCar ? { text: "• Dispone de coche", color: "#DCE7E6", fontSize: 8.5 } : null,
    s.skills.length ? sideTitle("Tecnologías") : null,
    ...s.skills.map((k) => ({ stack: [
      { columns: [{ text: k.name, color: "#FFFFFF", fontSize: 8.5 }, { text: `${k.level}%`, color: "#9FB5B4", fontSize: 7.5, alignment: "right", width: 30 }] },
      { canvas: [{ type: "rect", x: 0, y: 2, w: BAR_W, h: 3, r: 1.5, color: "#2C5554" }, { type: "rect", x: 0, y: 2, w: Math.max(2, (BAR_W * k.level) / 100), h: 3, r: 1.5, color: ACC }], margin: [0, 0, 0, 6] },
    ] })),
    s.competencies.length ? sideTitle("Competencias") : null,
    s.competencies.length ? { text: s.competencies.join("  ·  "), color: "#DCE7E6", fontSize: 8.5, lineHeight: 1.3 } : null,
    s.languages.length ? sideTitle("Idiomas") : null,
    ...s.languages.map((l) => ({ columns: [{ text: l.name, color: "#FFFFFF", fontSize: 8.5 }, { text: l.level, color: "#9FB5B4", fontSize: 8, alignment: "right" }], margin: [0, 0, 0, 4] })),
  ].filter(Boolean);
  const dot = (stack) => ({ columns: [{ width: 12, canvas: [{ type: "ellipse", x: 3, y: 5, r1: 2.6, r2: 2.6, color: MAIN }] }, { stack }], margin: [0, 0, 0, 8] });
  const main = [
    s.profile ? mainTitle("Perfil profesional") : null,
    s.profile ? { text: s.profile, fontSize: 9, color: INK, lineHeight: 1.3 } : null,
    s.experience.length ? mainTitle("Experiencia laboral") : null,
    ...s.experience.map((e) => dot([
      { text: e.title || e.company, bold: true, fontSize: 9.5, color: INK },
      e.title && e.company ? { text: e.company, fontSize: 8.5, color: MUTED } : null,
      e.from || e.to ? { text: [e.from, e.to].filter(Boolean).join(" - "), fontSize: 8, color: MUTED, margin: [0, 1, 0, 2] } : null,
      e.description ? { text: e.description, fontSize: 8.5, color: INK } : null,
      e.bullets.length ? { ul: e.bullets.map((b) => ({ text: b, fontSize: 8.5, color: INK })), markerColor: MAIN, margin: [0, 2, 0, 0] } : null,
    ].filter(Boolean))),
    s.education.length ? mainTitle("Formación académica") : null,
    ...s.education.map((e) => dot([
      { text: e.title, bold: true, fontSize: 9.5, color: INK },
      e.center ? { text: e.center, fontSize: 8.5, color: MUTED } : null,
      e.from || e.to ? { text: [e.from, e.to].filter(Boolean).join(" - "), fontSize: 8, color: MUTED } : null,
    ].filter(Boolean))),
    course?.name ? dot([{ text: course.name.toUpperCase(), bold: true, fontSize: 9.5, color: INK }, { text: brand.name ? `Escuela ${brand.name}` : "En curso", fontSize: 8.5, color: MUTED }]) : null,
    course?.modules?.length ? mainTitle(`Lo que estudia en ${course.name}`) : null,
    course?.modules?.length ? {
      columns: [0, 1].map((col) => ({ stack: course.modules.filter((_, i) => i % 2 === col).map((m) => ({
        table: { widths: ["*"], body: [[{ stack: [{ text: m.title, bold: true, fontSize: 8.5, color: INK }, m.tools ? { text: m.tools, fontSize: 8, color: MUTED } : null].filter(Boolean), border: [true, false, false, false], borderColor: [MAIN, MAIN, MAIN, MAIN], margin: [6, 0, 0, 0] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 1.5 : 0), vLineColor: () => MAIN }, margin: [0, 0, 6, 7],
      })) })),
      columnGap: 8,
    } : null,
  ].filter(Boolean);
  return {
    pageSize: "A4",
    pageMargins: [0, 26, 26, 26],
    background: () => ({ canvas: [{ type: "rect", x: 0, y: 0, w: SIDE_W, h: 841, color: DARK }] }),
    info: { title: `CV · ${name}`, author: brand.name || "" },
    defaultStyle: { font: "Roboto" },
    content: [{ columns: [{ width: SIDE_W, stack: side, margin: [20, 0, 20, 0] }, { width: "*", stack: main, margin: [22, 0, 0, 0] }] }],
  };
}

async function buildCv(studentId) {
  const ref = db.collection("students").doc(studentId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Alumno no encontrado");
  const s = { ...cleanStudent(snap.data()), orgId: snap.data().orgId };
  const course = snap.data().courseId ? (await db.collection("schoolCourses").doc(snap.data().courseId).get()).data() : null;
  const brand = brandOf(await getOrg(s.orgId));
  const pdf = await renderPdf(cvDefinition(s, course ? { name: course.name, modules: (course.modules || []).slice(0, 12) } : null, brand));
  const slug = [s.firstName, s.lastName].join("_").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_").slice(0, 60) || "alumno";
  const path = `school/${s.orgId}/cv/${studentId}.pdf`;
  await bucket().file(path).save(pdf, { contentType: "application/pdf", resumable: false });
  const cv = { path, name: `curriculum_${slug}.pdf`, size: pdf.length, at: new Date() };
  await ref.update({ cv, updatedAt: new Date() });
  return cv;
}

/* ------------------------------------------------------------------ rutas públicas */

// GET /api/school/courses?org= → cursos activos (para el formulario de alta)
async function publicCourses(req, res) {
  const org = await schoolOrg(str(req.query.org, 64));
  if (!org) return res.status(404).json({ ok: false, error: "No disponible" });
  const snap = await db.collection("schoolCourses").where("orgId", "==", org.id).get();
  const courses = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.active !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name)))
    .map((c) => ({ id: c.id, name: c.name, description: c.description || "" }));
  const st = await settingsOf(org);
  res.json({ ok: true, school: st.schoolName, brand: { name: brandOf(org).name, color: brandOf(org).color, logoUrl: brandOf(org).logoUrl }, courses });
}

// POST /api/school/apply { org?, courseId, ...cv, consent, recaptchaToken }
async function apply(req, res) {
  const b = req.body || {};
  const org = await schoolOrg(str(b.org, 64));
  if (!org) return res.status(404).json({ ok: false, error: "No disponible" });
  if (tooMany(req.ip || "?")) return res.status(429).json({ ok: false, error: "Demasiados envíos seguidos. Prueba en unos minutos." });
  const check = await verifyRecaptcha(b.recaptchaToken, req.ip);
  if (!check.ok) return res.status(403).json({ ok: false, error: "Verificación anti-spam fallida" });
  if (b.consent !== true) return res.status(400).json({ ok: false, error: "Tienes que aceptar la política de privacidad" });
  const s = cleanStudent(b);
  if (!s.firstName || !s.lastName) return res.status(400).json({ ok: false, error: "Escribe tu nombre y apellidos" });
  if (!EMAIL_RE.test(s.email)) return res.status(400).json({ ok: false, error: "Escribe un email válido" });
  const courseId = str(b.courseId, 64);
  const course = ID_RE.test(courseId) ? (await db.collection("schoolCourses").doc(courseId).get()).data() : null;
  if (!course || course.orgId !== org.id || course.active === false) return res.status(400).json({ ok: false, error: "Elige un curso" });
  // Mismo email en el mismo curso → se actualiza su ficha (no se duplica).
  const dup = (await db.collection("students").where("orgId", "==", org.id).where("email", "==", s.email).get()).docs
    .find((d) => d.data().courseId === courseId);
  const now = new Date();
  const data = { ...s, orgId: org.id, courseId, courseName: course.name, consentAt: now, consentIp: str(req.ip, 60), source: "Formulario web", updatedAt: now };
  let id;
  if (dup) { id = dup.id; await dup.ref.update(data); }
  else { id = (await db.collection("students").add({ ...data, status: "Nuevo", createdAt: now })).id; }
  const cv = await buildCv(id).catch((e) => { console.error("[escuela] CV:", e.message); return null; });
  const st = await settingsOf(org);
  const brand = brandOf(org);
  const name = `${s.firstName} ${s.lastName}`;
  await addActivity(org.id, { type: "Formulario", title: `🎓 Alta de alumnado: ${name} · ${course.name}`, entity: null, entityId: null, studentId: id, done: true });
  // Al alumno: confirmación con su CV adjunto.
  await queueMail(org.id, {
    to: s.email, toName: name, kind: "school", studentId: id, subject: `Tu inscripción en ${course.name} · ${st.schoolName}`,
    html: brandMailHtml(brand, { title: "¡Inscripción recibida!", body: `Hola ${esc(s.firstName)},<br><br>Hemos recibido tu inscripción en <b>${esc(course.name)}</b>. Te adjuntamos el currículum que hemos preparado con tus datos; si quieres cambiar algo, responde a este correo.<!--ADJUNTOS-->`, cta: "", ctaUrl: "" }),
    attachments: cv ? [{ path: cv.path, name: cv.name, size: cv.size, type: "application/pdf" }] : [],
  });
  // Al equipo: aviso.
  if (st.notifyEmail) await queueMail(org.id, {
    to: st.notifyEmail, kind: "school", studentId: id, subject: `Nueva alta de alumnado: ${name} · ${course.name}`,
    html: brandMailHtml(brand, { title: "Nueva alta de alumnado", body: `<b>${esc(name)}</b> se ha inscrito en <b>${esc(course.name)}</b>${s.city ? ` (${esc(s.city)})` : ""}.<br>Email: ${esc(s.email)}${s.phone ? ` · Tel.: ${esc(s.phone)}` : ""}<br><br>Lo tienes en Escuela › Alumnado prácticas.`, cta: "", ctaUrl: "" }),
  });
  res.json({ ok: true });
}

async function placementByToken(token) {
  if (!TOKEN_RE.test(String(token || ""))) return null;
  const snap = await db.collection("schoolPlacements").where("token", "==", token).limit(1).get();
  const p = snap.docs[0];
  return p && p.data().active !== false ? { id: p.id, ref: p.ref, ...p.data() } : null;
}

// GET /api/school/match/:token → empresa + alumnos asignados (sin email ni teléfono)
async function match(req, res) {
  const p = await placementByToken(req.params.token);
  if (!p) return res.status(404).json({ ok: false, error: "Enlace no válido o caducado" });
  const org = await getOrg(p.orgId);
  const brand = brandOf(org);
  const st = await settingsOf(org);
  const ids = (p.studentIds || []).filter((x) => ID_RE.test(x)).slice(0, 200);
  const docs = ids.length ? await db.getAll(...ids.map((x) => db.collection("students").doc(x))) : [];
  const at = p.assignedAt || {};
  const students = docs.filter((d) => d.exists && d.data().orgId === p.orgId).map((d) => {
    const s = d.data();
    return {
      id: d.id, name: [s.firstName, s.lastName].filter(Boolean).join(" "), course: s.courseName || "", headline: s.headline || "",
      specialties: s.specialties || [], city: s.city || "", hasCar: !!s.hasCar, hasCv: !!s.cv?.path,
      isNew: Date.now() - (Number(at[d.id]) || 0) < 7 * 864e5,
    };
  });
  res.json({
    ok: true, school: st.schoolName,
    brand: { name: brand.name, color: brand.color, accent: brand.accent, logoUrl: brand.logoUrl, website: brand.website },
    company: { name: p.companyName || "", city: p.city || "", slots: Number(p.slots) || 0, courses: p.courseNames || [] },
    contact: { name: p.managerName || "", email: p.managerEmail || st.notifyEmail || "", phone: p.managerPhone || "" },
    students,
  });
}

// GET /api/school/match/:token/cv/:id → PDF del CV (solo alumnos asignados a esa empresa)
async function matchCv(req, res) {
  const p = await placementByToken(req.params.token);
  if (!p || !(p.studentIds || []).includes(req.params.id) || !ID_RE.test(req.params.id)) return res.status(404).send("No disponible");
  const s = (await db.collection("students").doc(req.params.id).get()).data();
  if (!s || s.orgId !== p.orgId || !s.cv?.path) return res.status(404).send("No disponible");
  const [buf] = await bucket().file(s.cv.path).download();
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${String(s.cv.name || "cv.pdf").replace(/[^\w.-]/g, "_")}"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
  res.send(buf);
}

// POST /api/school/match/:token/interview { studentId, name, email, phone, message }
async function interview(req, res) {
  const p = await placementByToken(req.params.token);
  if (!p) return res.status(404).json({ ok: false, error: "Enlace no válido" });
  if (tooMany("iv:" + (req.ip || "?"), 15)) return res.status(429).json({ ok: false, error: "Demasiadas solicitudes seguidas" });
  const b = req.body || {};
  const studentId = str(b.studentId, 64);
  if (!(p.studentIds || []).includes(studentId)) return res.status(400).json({ ok: false, error: "Alumno no válido" });
  const who = { name: str(b.name, 100), email: norm(str(b.email, 160)), phone: str(b.phone, 40), message: str(b.message, 1500) };
  if (!who.name || (!EMAIL_RE.test(who.email) && !who.phone)) return res.status(400).json({ ok: false, error: "Escribe tu nombre y un email o teléfono" });
  const s = (await db.collection("students").doc(studentId).get()).data() || {};
  const studentName = [s.firstName, s.lastName].filter(Boolean).join(" ");
  const now = new Date();
  await db.collection("schoolInterviews").add({ orgId: p.orgId, placementId: p.id, companyName: p.companyName || "", studentId, studentName, ...who, status: "Nueva", createdAt: now, updatedAt: now });
  const org = await getOrg(p.orgId);
  const st = await settingsOf(org);
  const to = norm(p.managerEmail) || st.notifyEmail;
  if (to) await queueMail(p.orgId, {
    to, kind: "school", studentId, replyTo: EMAIL_RE.test(who.email) ? who.email : "",
    subject: `Solicitud de entrevista: ${studentName} · ${p.companyName || "empresa"}`,
    html: brandMailHtml(brandOf(org), { title: "Solicitud de entrevista", body: `<b>${esc(p.companyName || "Una empresa")}</b> quiere entrevistar a <b>${esc(studentName)}</b> (${esc(s.courseName || "")}).<br><br>Contacto: ${esc(who.name)}${who.email ? ` · ${esc(who.email)}` : ""}${who.phone ? ` · ${esc(who.phone)}` : ""}${who.message ? `<br><br>Mensaje:<br>${esc(who.message).replace(/\n/g, "<br>")}` : ""}`, cta: "", ctaUrl: "" }),
  });
  await addActivity(p.orgId, { type: "Nota", title: `🎓 ${p.companyName || "Empresa"} pide entrevista con ${studentName}`, entity: null, entityId: null, studentId, done: false });
  res.json({ ok: true });
}

/* ------------------------------------------------------------------ rutas del equipo */

async function staffStudent(req, res) {
  const user = await staffFromReq(req);
  if (!user) { res.status(401).json({ ok: false, error: "Sesión no válida" }); return null; }
  if (!featuresOf(user.org).school) { res.status(403).json({ ok: false, error: "Sin acceso" }); return null; }
  const id = str(req.body?.id, 64);
  const snap = ID_RE.test(id) ? await db.collection("students").doc(id).get() : null;
  if (!snap?.exists || snap.data().orgId !== user.orgId) { res.status(404).json({ ok: false, error: "Alumno no encontrado" }); return null; }
  return { user, id, data: snap.data() };
}

// POST /api/school/cv-url { id } → enlace temporal al CV (10 min)
async function cvUrl(req, res) {
  const r = await staffStudent(req, res);
  if (!r) return;
  const cv = r.data.cv?.path ? r.data.cv : await buildCv(r.id);
  const [url] = await bucket().file(cv.path).getSignedUrl({ action: "read", expires: Date.now() + 10 * 60e3, responseDisposition: `inline; filename="${cv.name}"` });
  res.json({ ok: true, url });
}

// POST /api/school/cv-regenerate { id } (tras editar la ficha)
async function cvRegenerate(req, res) {
  const r = await staffStudent(req, res);
  if (!r) return;
  const cv = await buildCv(r.id);
  res.json({ ok: true, cv: { ...cv, at: cv.at.toISOString() } });
}

// Token para el enlace público de una empresa de prácticas (lo pide la app al crearla).
const newToken = () => crypto.randomBytes(18).toString("base64url");
// POST /api/school/placement-token → { token }
async function placementToken(req, res) {
  const user = await staffFromReq(req);
  if (!user || !featuresOf(user.org).school) return res.status(401).json({ ok: false, error: "Sin acceso" });
  res.json({ ok: true, token: newToken() });
}

module.exports = { STATUSES, cleanStudent, cvDefinition, buildCv, publicCourses, apply, match, matchCv, interview, cvUrl, cvRegenerate, placementToken };
