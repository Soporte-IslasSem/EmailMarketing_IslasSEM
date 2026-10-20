// Sección "Talento Digital": altas del directorio talentodigitalcanarias.com.
//
// Cuando la administradora da de alta una empresa en Talento Digital, esa web
// llama a POST /api/talento-digital/empresa (con la clave compartida
// TALENTO_DIGITAL_KEY) y la empresa aparece aquí con su enlace personal para
// completar el registro. Nada se envía solo: la administradora redacta el correo
// en esta sección y lo envía por la misma cola (outbox) que las campañas.
const crypto = require("crypto");
const { admin, db } = require("./firebase");
const { DEFAULT_ORG_ID } = require("./link");
const { staffFromReq } = require("./access");

const ALTAS = "talentoDigitalAltas";
const PLANTILLA = db.collection("talentoDigitalConfig").doc("plantilla");

// Solo se aceptan enlaces de las dos webs de Talento Digital (si la clave se
// filtrara, no serviría para mandar correos con enlaces a otros sitios).
const ENLACE_OK = /^https:\/\/(prueba\.)?talentodigitalcanarias\.com\/confirmar-alta\?token=[0-9a-f]{64}$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const PLANTILLA_INICIAL = {
  asunto: "Tu alta en Talento Digital Canarias está confirmada",
  remitente: "Talento Digital Canarias",
  mensaje: [
    "Hola {{nombre}}:",
    "",
    "Tu empresa ya está dada de alta en el directorio de Talento Digital Canarias.",
    "",
    "Para gestionar tu ficha cuando quieras, completa tu registro eligiendo tu usuario y tu contraseña:",
    "",
    "{{boton}}",
    "",
    "Iniciarás sesión con este correo: {{email}}",
    "",
    "Un saludo,",
    "El equipo de Talento Digital Canarias",
  ].join("\n"),
  boton: "Completa tu registro",
};

function claveValida(req) {
  const esperada = String(process.env.TALENTO_DIGITAL_KEY || "");
  const recibida = String(req.headers["x-api-key"] || "");
  if (esperada.length < 32 || recibida.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada));
}

const escapar = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Texto de la administradora → HTML del correo. Variables: {{nombre}}, {{email}},
// {{enlace_alta}} (el enlace en texto) y {{boton}} (el botón; si no se pone, va al final).
function renderCorreo({ mensaje, boton }, empresa) {
  const vars = {
    nombre: escapar(empresa.nombre),
    email: escapar(empresa.email),
    enlace_alta: `<a href="${escapar(empresa.enlace)}" style="color:#0f6e6e">${escapar(empresa.enlace)}</a>`,
  };
  const botonHtml = `<p style="margin:24px 0;text-align:center"><a href="${escapar(empresa.enlace)}" style="display:inline-block;background:#e3b623;color:#011d59;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:999px">${escapar(boton || PLANTILLA_INICIAL.boton)}</a></p>`;

  let texto = escapar(mensaje || "");
  if (!/{{\s*boton\s*}}/i.test(texto)) texto += "\n\n{{boton}}";
  const parrafos = texto.split(/\n{2,}/).map((p) => {
    if (/^\s*{{\s*boton\s*}}\s*$/i.test(p)) return botonHtml;
    const conVars = p
      .replace(/{{\s*(nombre|email|enlace_alta)\s*}}/gi, (_, v) => vars[v.toLowerCase()])
      .replace(/{{\s*boton\s*}}/gi, botonHtml)
      .replace(/\n/g, "<br>");
    return `<p style="margin:0 0 14px">${conVars}</p>`;
  });

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#33414a;max-width:600px;margin:0 auto;padding:24px">${parrafos.join("")}</div>`;
}

function limpiarPlantilla(body = {}) {
  return {
    asunto: String(body.asunto || "").trim().slice(0, 200),
    remitente: String(body.remitente || "").trim().slice(0, 80),
    mensaje: String(body.mensaje || "").slice(0, 10000),
    boton: String(body.boton || "").trim().slice(0, 60),
  };
}

// POST /api/talento-digital/empresa (x-api-key) ← talentodigitalcanarias.com
// { origen: "principal"|"prueba", empresaId, nombre, email, enlace, evento: "alta"|"completado" }
async function recibirEmpresa(req, res) {
  if (!claveValida(req)) return res.status(401).json({ ok: false, error: "Clave no válida" });

  const b = req.body || {};
  const origen = b.origen === "prueba" ? "prueba" : "principal";
  const empresaId = String(b.empresaId || "").replace(/\D/g, "");
  if (!empresaId) return res.status(400).json({ ok: false, error: "Falta empresaId" });
  const ref = db.collection(ALTAS).doc(`${origen}_${empresaId}`);

  if (b.evento === "completado") {
    await ref.set({ completadoEn: Date.now(), actualizadoEn: Date.now() }, { merge: true });
    return res.json({ ok: true });
  }

  const email = String(b.email || "").trim().toLowerCase();
  const enlace = String(b.enlace || "").trim();
  if (!EMAIL_OK.test(email) || !ENLACE_OK.test(enlace)) return res.status(400).json({ ok: false, error: "Datos no válidos" });

  // Un alta nueva (o un enlace regenerado, que invalida el anterior) deja la
  // empresa pendiente de enviar.
  await ref.set({
    origen, empresaId,
    nombre: String(b.nombre || "").trim().slice(0, 200),
    email, enlace,
    archivada: false,
    completadoEn: null,
    ultimoEnvio: null,
    recibidaEn: Date.now(),
    actualizadoEn: Date.now(),
  }, { merge: true });
  res.json({ ok: true });
}

async function requiereStaff(req, res) {
  const user = await staffFromReq(req);
  if (!user) res.status(401).json({ ok: false, error: "Sin acceso" });
  return user;
}

// GET /api/talento-digital/empresas → altas (sin archivar) + plantilla guardada
async function listarEmpresas(req, res) {
  if (!(await requiereStaff(req, res))) return;
  const snap = await db.collection(ALTAS).where("archivada", "==", false).get();
  const empresas = await Promise.all(snap.docs.map(async (d) => {
    const e = { id: d.id, ...d.data() };
    // Estado real del último envío (pendiente/enviado/fallido) desde la cola.
    if (e.ultimoEnvio?.outboxId) {
      const o = await db.collection("outbox").doc(e.ultimoEnvio.outboxId).get().catch(() => null);
      if (o && o.exists) e.ultimoEnvio = { ...e.ultimoEnvio, estado: o.data().status, error: o.data().error || "" };
    }
    return e;
  }));
  empresas.sort((a, b) => (b.recibidaEn || 0) - (a.recibidaEn || 0));
  const p = await PLANTILLA.get();
  res.json({ ok: true, empresas, plantilla: p.exists ? { ...PLANTILLA_INICIAL, ...p.data() } : PLANTILLA_INICIAL });
}

// POST /api/talento-digital/plantilla { asunto, remitente, mensaje, boton }
async function guardarPlantilla(req, res) {
  if (!(await requiereStaff(req, res))) return;
  await PLANTILLA.set({ ...limpiarPlantilla(req.body), actualizadaEn: Date.now() });
  res.json({ ok: true });
}

// POST /api/talento-digital/vista-previa { id?, mensaje, boton } → { html }
async function vistaPrevia(req, res) {
  if (!(await requiereStaff(req, res))) return;
  let empresa = { nombre: "Nombre de la empresa", email: "empresa@ejemplo.com", enlace: "https://talentodigitalcanarias.com/confirmar-alta?token=..." };
  if (req.body?.id) {
    const d = await db.collection(ALTAS).doc(String(req.body.id)).get();
    if (d.exists) empresa = d.data();
  }
  res.json({ ok: true, html: renderCorreo(limpiarPlantilla(req.body), empresa) });
}

function itemOutbox({ to, toName, subject, fromName, html }) {
  return {
    orgId: DEFAULT_ORG_ID, to, toName, subject, fromName, html,
    kind: "talento-digital", status: "pending", attempts: 0, error: "", sentAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// POST /api/talento-digital/enviar { ids[], asunto, remitente, mensaje, boton, prueba? }
// Con "prueba" (un email) manda un único correo de prueba con los datos de la
// primera empresa elegida y no marca nada como enviado.
async function enviar(req, res) {
  const user = await requiereStaff(req, res);
  if (!user) return;
  const plantilla = limpiarPlantilla(req.body);
  if (!plantilla.asunto || !plantilla.mensaje.trim()) return res.status(400).json({ ok: false, error: "Escribe el asunto y el mensaje" });

  const ids = [...new Set((req.body?.ids || []).map(String))].slice(0, 200);
  const docs = (await Promise.all(ids.map((id) => db.collection(ALTAS).doc(id).get()))).filter((d) => d.exists);
  if (!docs.length) return res.status(400).json({ ok: false, error: "Elige al menos una empresa" });

  const prueba = String(req.body?.prueba || "").trim().toLowerCase();
  if (prueba) {
    if (!EMAIL_OK.test(prueba)) return res.status(400).json({ ok: false, error: "Email de prueba no válido" });
    const e = docs[0].data();
    await db.collection("outbox").add({ ...itemOutbox({ to: prueba, toName: "Prueba", subject: `[PRUEBA] ${plantilla.asunto}`, fromName: plantilla.remitente, html: renderCorreo(plantilla, e) }), isTest: true });
    return res.json({ ok: true, enviados: 1 });
  }

  let enviados = 0;
  for (const d of docs) {
    const e = d.data();
    if (!EMAIL_OK.test(e.email || "") || !ENLACE_OK.test(e.enlace || "")) continue;
    const ref = await db.collection("outbox").add(itemOutbox({
      to: e.email, toName: e.nombre || "", subject: plantilla.asunto, fromName: plantilla.remitente, html: renderCorreo(plantilla, e),
    }));
    await d.ref.set({
      ultimoEnvio: { outboxId: ref.id, fecha: Date.now(), asunto: plantilla.asunto, por: user.email },
      actualizadoEn: Date.now(),
    }, { merge: true });
    enviados++;
  }
  await PLANTILLA.set({ ...plantilla, actualizadaEn: Date.now() });
  res.json({ ok: true, enviados });
}

// POST /api/talento-digital/archivar { ids[] } → las quita de la lista (no borra nada en Talento Digital)
async function archivar(req, res) {
  if (!(await requiereStaff(req, res))) return;
  const ids = [...new Set((req.body?.ids || []).map(String))].slice(0, 200);
  for (const id of ids) await db.collection(ALTAS).doc(id).set({ archivada: true, actualizadoEn: Date.now() }, { merge: true });
  res.json({ ok: true });
}

module.exports = { recibirEmpresa, listarEmpresas, guardarPlantilla, vistaPrevia, enviar, archivar, renderCorreo };
