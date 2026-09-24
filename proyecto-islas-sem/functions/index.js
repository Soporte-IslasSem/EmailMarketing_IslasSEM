/* ============================================================
   IMPORTS GEN 2
   ============================================================ */
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");

/* ============================================================
   INICIALIZAR FIREBASE ADMIN
   ============================================================ */
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/* ============================================================
   VARIABLES SMTP DESDE SECRET MANAGER
   ============================================================ */
const SMTP_EMAIL = process.env.SMTP_EMAIL;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;

/* ============================================================
   Exige que quien llama esté logueado (funciones invocables)
   ============================================================ */
const requireAuth = (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión para hacer esto.");
  }
};

/* ============================================================
   1) ENVÍO DE EMAILS DE PRUEBA
   ============================================================ */
exports.sendTestEmail = onCall({ region: "us-central1" }, async (request) => {
  requireAuth(request);

  const { to, subject, html, from } = request.data;

  if (!to || !subject || !html) {
    throw new HttpsError("invalid-argument", "Faltan datos");
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: false,
      auth: {
        user: SMTP_EMAIL,
        pass: SMTP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: from || "no-reply@islassem.com",
      to,
      subject,
      html,
    });

    return { success: true };
  } catch (error) {
    logger.error("Error en sendTestEmail:", error);
    throw new HttpsError("internal", "Error enviando email");
  }
});

/* ============================================================
   2) IMPORTACIÓN REAL DESDE MAILCHIMP
   ============================================================ */
exports.importFromMailchimp = onCall({ region: "us-central1" }, async (request) => {
  requireAuth(request);

  const { apiKey, serverPrefix, listId } = request.data;

  if (!apiKey || !serverPrefix || !listId) {
    throw new HttpsError("invalid-argument", "Faltan parámetros");
  }

  try {
    const url = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${listId}/members?count=1000`;

    const response = await fetch(url, {
      headers: { Authorization: `apikey ${apiKey}` },
    });

    if (!response.ok) {
      throw new HttpsError("internal", "Error al conectar con Mailchimp");
    }

    const json = await response.json();

    const emails = json.members
      .map((m) => m.email_address?.toLowerCase())
      .filter(Boolean);

    return { emails };
  } catch (error) {
    logger.error("Error en importFromMailchimp:", error);
    throw new HttpsError("internal", "Error interno");
  }
});

/* ============================================================
   3) IMPORTACIÓN REAL DESDE GOOGLE SHEETS
   ============================================================ */
exports.importFromGoogleSheets = onCall({ region: "us-central1" }, async (request) => {
  requireAuth(request);

  const { token, sheetId, range } = request.data;

  if (!token || !sheetId || !range) {
    throw new HttpsError("invalid-argument", "Faltan parámetros");
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const bodyText = await response.text();

    if (!response.ok) {
      throw new HttpsError("internal", "Error al leer Google Sheets");
    }

    const json = JSON.parse(bodyText);

    const emails = json.values
      ?.flat()
      .map((v) => v.toLowerCase().trim())
      .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));

    return { emails };
  } catch (error) {
    logger.error("Error en importFromGoogleSheets:", error);
    throw new HttpsError("internal", "Error interno");
  }
});

/* ============================================================
   4) IMPORTACIÓN REAL DESDE COVERMANAGER
   ============================================================ */
exports.importFromCoverManager = onCall({ region: "us-central1" }, async (request) => {
  requireAuth(request);

  const { apiKey } = request.data;

  if (!apiKey) {
    throw new HttpsError("invalid-argument", "Falta API Key");
  }

  try {
    const url = "https://api.covermanager.com/v1/customers";

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new HttpsError("internal", "Error al conectar con CoverManager");
    }

    const json = await response.json();

    const emails = json.customers
      ?.map((c) => c.email?.toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    return { emails };
  } catch (error) {
    logger.error("Error en importFromCoverManager:", error);
    throw new HttpsError("internal", "Error interno");
  }
});

/* ============================================================
   5) ENVÍO REAL DE CAMPAÑAS + CREACIÓN DE INFORME
   ============================================================ */
exports.sendCampaignEmail = onCall({ region: "us-central1" }, async (request) => {
  requireAuth(request);

  const { campaign, subscribers } = request.data;

  if (!campaign || !subscribers || subscribers.length === 0) {
    throw new HttpsError("invalid-argument", "Faltan datos");
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: false,
      auth: {
        user: SMTP_EMAIL,
        pass: SMTP_PASSWORD,
      },
    });

    const results = [];

    for (const sub of subscribers) {
      try {
        await transporter.sendMail({
          from: campaign.config.senderEmail,
          to: sub.email,
          subject: campaign.config.subject,
          html: campaign.template.html,
        });

        results.push({ email: sub.email, status: "sent" });
      } catch (err) {
        results.push({ email: sub.email, status: "error" });
      }
    }

    const reportRef = await db.collection("reports").add({
      campaignId: campaign.id || null,
      campaignName: campaign.config.campaignName || "Sin nombre",
      ownerId: campaign.ownerId || null,
      sentAt: new Date(),
      totalRecipients: subscribers.length,
      results,
      status: "sent",
    });

    if (campaign.id) {
      await db.collection("campaigns").doc(campaign.id).update({
        reportId: reportRef.id,
      });
    }

    return { success: true, reportId: reportRef.id };
  } catch (error) {
    logger.error("Error en sendCampaignEmail:", error);
    throw new HttpsError("internal", "Error interno");
  }
});


/* ============================================================
   6) RECIBIR SUSCRIPCIONES DESDE FORMULARIOS EMBEBIDOS
   (pública, sin login: la llama gente anónima desde webs externas)
   ============================================================ */
exports.submitForm = onRequest({ region: "us-central1" }, async (req, res) => {
  // Manejo manual de preflight (CORS)
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).send("");
  }

  cors(req, res, async () => {
    res.set("Access-Control-Allow-Origin", "*");

    try {
      const { formId, email } = req.body;

      if (!formId || !email) {
        return res.status(400).json({ error: "Faltan datos" });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Email no válido" });
      }

      const formSnap = await db.collection("forms").doc(formId).get();

      if (!formSnap.exists) {
        return res.status(404).json({ error: "Formulario no encontrado" });
      }

      const form = formSnap.data();
      const normalizedEmail = email.toLowerCase().trim();

      // Evitar duplicados en la misma lista
      const existing = await db
        .collection("subscribers")
        .where("email", "==", normalizedEmail)
        .where("listId", "==", form.listId)
        .get();

      if (existing.empty) {
        await db.collection("subscribers").add({
          email: normalizedEmail,
          listId: form.listId,
          userId: form.userId,
          status: "subscribed",
          source: "form",
          createdAt: new Date(),
        });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error("Error en submitForm:", error);
      res.status(500).json({ error: "Error interno" });
    }
  });
});