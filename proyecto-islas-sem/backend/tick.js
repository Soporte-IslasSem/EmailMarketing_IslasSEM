// Ejecuta una pasada (correos + SLA) y termina. Para usar desde el cron de Plesk
// como comando:  node /ruta/backend/tick.js
// (alternativa a llamar al endpoint HTTP /tasks/run).
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const { drainOutbox } = require("./lib/outbox");
const { runSLA } = require("./lib/sla");
const { processReplies } = require("./lib/inbox");

(async () => {
  try {
    const mail = await drainOutbox();
    const replies = await processReplies();
    const sla = await runSLA();
    console.log(new Date().toISOString(), "OK", JSON.stringify({ mail, replies, sla }));
    process.exit(0);
  } catch (e) {
    console.error(new Date().toISOString(), "ERROR", e.message);
    process.exit(1);
  }
})();
