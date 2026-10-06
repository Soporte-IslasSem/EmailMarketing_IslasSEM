// Automatización 24/7 del SLA: ofertas cuyo plazo venció sin respuesta ->
// Kanban Negativo + tarea de re-contacto + registro. Corre por cron.
const { db } = require("./firebase");
const { pickNegTarget, plazoTxt } = require("./stages");

async function runSLA() {
  const now = Date.now();
  const [dealsSnap, pipesSnap] = await Promise.all([
    db.collection("deals").get(),
    db.collection("pipelines").get(),
  ]);
  const pipelines = pipesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let fired = 0;
  for (const dref of dealsSnap.docs) {
    const d = { id: dref.id, ...dref.data() };
    const o = d.offer;
    if (!o || o.state !== "enviada" || !o.dueAt || now < o.dueAt || o.escalatedAt) continue;
    if ((d.board || "pos") === "neg") continue;
    if (d.status === "ganado" || d.status === "perdido") continue;
    const pipeline = pipelines.find((p) => p.id === d.pipelineId) || pipelines[0];
    if (!pipeline) continue;
    const target = pickNegTarget(pipeline, d);
    try {
      await dref.ref.update({ board: "neg", stage: target ? target.id : d.stage, prevStage: d.stage, offer: { ...o, state: "seguimiento", escalatedAt: now } });
      await db.collection("activities").add({
        orgId: d.orgId, type: "Tarea",
        title: `☎ Sin respuesta en ${plazoTxt(o.plazoH)} · Re-contactar a ${d.contact || d.title}`,
        entity: "deal", entityId: d.id, contactId: d.contactId || "",
        dueDate: new Date().toISOString().slice(0, 10), assignee: d.responsable || "Responsable",
        done: false, auto: true, createdAt: new Date(),
      });
      await db.collection("activities").add({
        orgId: d.orgId, type: "Nota",
        title: `⏰ Automatización · Sin respuesta en ${plazoTxt(o.plazoH)} → movida al Kanban Negativo${target ? ` · ${target.label}` : ""}`,
        entity: "deal", entityId: d.id, contactId: d.contactId || "", done: false, auto: true, createdAt: new Date(),
      });
      fired++;
    } catch (e) { console.warn("[sla] no se pudo escalar:", e.message); }
  }
  return { fired, scanned: dealsSnap.size };
}

module.exports = { runSLA };
