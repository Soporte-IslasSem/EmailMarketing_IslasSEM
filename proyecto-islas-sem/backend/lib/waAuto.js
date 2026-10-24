// Lo automático de WhatsApp (configurable en WhatsApp › Ajustes):
// - Chatbot: a cada conversación nueva le manda un menú (lista o botones de WhatsApp). La
//   opción elegida puede contestar, asignar equipo/agente, mover de columna y etiquetar.
// - Asignación automática aleatoria (si no hay chatbot): entre los agentes disponibles.
// - Bienvenida (solo la primera vez que escribe) y fuera de horario (como mucho una vez cada
//   N horas por chat).
// - Mensaje de cierre: al archivar un chat se programa (closingDueAt) y lo manda el cron.
// El cron (cada minuto) también sincroniza plantillas cada 5 min y envía las difusiones.
const { db } = require("./firebase");
const wa = require("./whatsapp");
const cfgLib = require("./waConfig");

const BOT = "bot:";

async function afterInbound({ chat, isNew, newConversation, msg, cfg }) {
  const waId = chat.id;
  if (chat.blocked) return;
  const ref = wa.CHATS().doc(waId);
  const ar = cfg.autoReply || {};
  const now = Date.now();

  // Respuesta a una opción del chatbot.
  const replyId = msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id || "";
  if (replyId.startsWith(BOT)) {
    const opt = (cfg.chatbot.options || []).find((o) => o.id === replyId.slice(BOT.length));
    if (opt) return applyOption(ref, chat, opt, cfg);
  }

  const outOfHours = ar.hours?.enabled && ar.hours.text && !cfgLib.inHours(ar.hours);
  if (newConversation) {
    if (cfg.chatbot.enabled && cfg.chatbot.options?.length) await sendMenu(waId, cfg.chatbot);
    else {
      if (cfg.routing.enabled && !chat.assigneeEmail) {
        const a = await cfgLib.pickAssignee(cfg, "");
        if (a) await ref.update(a);
      }
      if (isNew && ar.welcome?.enabled && ar.welcome.text && !outOfHours) await wa.sendAutoText(waId, ar.welcome.text, "Bienvenida automática");
    }
  }
  if (outOfHours && (!chat.awayAt || now - chat.awayAt > (ar.hours.everyHours || 12) * 3600e3)) {
    await ref.update({ awayAt: now });
    await wa.sendAutoText(waId, ar.hours.text, "Fuera de horario");
  }
}

// Menú del chatbot: hasta 3 opciones → botones; más → lista desplegable.
async function sendMenu(waId, bot) {
  const opts = bot.options.slice(0, 10);
  const interactive = opts.length <= 3
    ? { type: "button", body: { text: bot.text }, action: { buttons: opts.map((o) => ({ type: "reply", reply: { id: BOT + o.id, title: o.label.slice(0, 20) } })) } }
    : { type: "list", body: { text: bot.text }, action: { button: bot.button || "Ver opciones", sections: [{ title: "Opciones", rows: opts.map((o) => ({ id: BOT + o.id, title: o.label.slice(0, 24), ...(o.description ? { description: o.description.slice(0, 72) } : {}) })) }] } };
  const text = `${bot.text}\n${opts.map((o) => `• ${o.label}`).join("\n")}`;
  return wa.sendAuto(waId, { type: "interactive", interactive }, { type: "interactive", text }, "Chatbot");
}

async function applyOption(ref, chat, opt, cfg) {
  const patch = {};
  if (opt.stage) Object.assign(patch, cfgLib.parseStage(cfg, opt.stage) || {}, { stageAt: Date.now() });
  if (opt.tagId && !(chat.tags || []).includes(opt.tagId)) patch.tags = [...(chat.tags || []), opt.tagId];
  if (opt.assigneeEmail) {
    const p = (await cfgLib.people()).find((x) => x.email === opt.assigneeEmail);
    Object.assign(patch, { assigneeEmail: opt.assigneeEmail, assigneeName: p?.name || opt.assigneeEmail });
    if (opt.teamId) patch.teamId = opt.teamId;
  } else if (opt.teamId) {
    patch.teamId = opt.teamId;
    const a = await cfgLib.pickAssignee({ ...cfg, routing: { ...cfg.routing, includeAway: false } }, opt.teamId)
      || await cfgLib.pickAssignee({ ...cfg, routing: { ...cfg.routing, includeAway: true } }, opt.teamId);
    if (a) Object.assign(patch, a);
  } else if (cfg.routing.enabled && !chat.assigneeEmail) {
    const a = await cfgLib.pickAssignee(cfg, "");
    if (a) Object.assign(patch, a);
  }
  if (Object.keys(patch).length) await ref.update(patch);
  if (opt.reply) await wa.sendAutoText(chat.id, opt.reply, "Chatbot");
}

// Mensajes de cierre pendientes (chats archivados hace X minutos).
async function runClosing() {
  const now = Date.now();
  const snap = await wa.CHATS().where("closingDueAt", ">", 0).where("closingDueAt", "<=", now).limit(100).get();
  if (snap.empty) return 0;
  const cfg = await cfgLib.getConfig();
  let sent = 0;
  for (const d of snap.docs) {
    const c = d.data();
    // Se marca antes de enviar: si el cron se solapa, no sale dos veces.
    const claimed = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(d.ref)).data();
      if (!cur?.closingDueAt || cur.closingDueAt > now) return false;
      tx.update(d.ref, { closingDueAt: 0 });
      return true;
    });
    if (!claimed) continue;
    const text = cfg.autoReply?.closing?.text;
    if (!c.archived || c.blocked || !text || !cfg.autoReply.closing.enabled || !c.lastInboundAt || now - c.lastInboundAt > wa.WINDOW_MS) continue;
    await wa.sendAutoText(d.id, text, "Mensaje de cierre").then(() => sent++).catch((e) => console.error("[whatsapp] cierre:", e.message || e));
    // El mensaje de cierre no saca el chat del archivo.
    await d.ref.update({ archived: true }).catch(() => {});
  }
  return sent;
}

async function runCron() {
  const s = await wa.settings(true);
  if (!s.token || !s.phoneNumberId) return { skipped: "sin configurar" };
  const tpl = require("./waTemplates");
  const closing = await runClosing().catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  const templates = s.wabaId && Date.now() - (s.templatesSyncedAt || 0) > 5 * 60e3
    ? await tpl.syncTemplates().catch((e) => ({ error: String(e.message || e).slice(0, 200) })) : "al día";
  const broadcasts = await tpl.processBroadcasts().catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  return { closing, templates, broadcasts };
}

module.exports = { afterInbound, runCron, sendMenu };
