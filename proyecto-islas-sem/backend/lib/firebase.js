// Inicializa Firebase Admin. La clave (service account) se lee de:
//   - GOOGLE_APPLICATION_CREDENTIALS = ruta al JSON (recomendado en Loading), o
//   - FIREBASE_SERVICE_ACCOUNT = contenido JSON en una variable de entorno.
const admin = require("firebase-admin");

function init() {
  if (admin.apps.length) return admin;
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = admin.credential.applicationDefault();
  } else {
    throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT");
  }
  admin.initializeApp({ credential });
  return admin;
}

const adminSdk = init();
const db = adminSdk.firestore();

module.exports = { admin: adminSdk, db };
