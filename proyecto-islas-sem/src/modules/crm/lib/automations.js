// Reglas de automatización que SE EJECUTAN al cambiar una negociación de etapa
// (modelado de Bitrix: al entrar en una etapa se disparan acciones).
import { crmCreate, crmUpdate, logActivity } from "./crm";
import { getStages, findStage } from "./pipelines";
import { queueEmail, basicEmail } from "./outbox";

export const WHEN_OPTS = [
  ["immediately", "inmediatamente", 0],
  ["1d", "En 1 día", 1],
  ["3d", "En 3 días", 3],
  ["7d", "En 7 días", 7],
];
export const ACTION_OPTS = [
  ["notification", "Notificación"],
  ["task", "Tarea"],
  ["control", "Control"],
  ["form", "Enviar formulario/documento"],
  ["email", "Enviar correo"],
];
export const TO_OPTS = [
  ["responsible", "Persona responsable"],
  ["supervisor", "Para el supervisor"],
];

// Texto de un plazo en horas (admite fracciones para el modo prueba: 0.033h -> "2 min").
export const plazoTxt = (h) => (h && h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h || 72}h`);

export const whenLabel = (w) => (WHEN_OPTS.find((x) => x[0] === w) || WHEN_OPTS[0])[1];
export const actionLabel = (a) => (ACTION_OPTS.find((x) => x[0] === a) || ACTION_OPTS[0])[1];
export const toLabel = (t) => (TO_OPTS.find((x) => x[0] === t) || TO_OPTS[0])[1];

export function getStageAutomations(pipeline, stageId) {
  return (pipeline.automations && pipeline.automations[stageId]) || [];
}
export async function setStageAutomations(pipeline, stageId, rules) {
  const automations = { ...(pipeline.automations || {}), [stageId]: rules };
  return crmUpdate("pipelines", pipeline.id, { automations });
}
export async function addStageRule(pipeline, stageId, rule) {
  const rules = [...getStageAutomations(pipeline, stageId), { id: "r" + Date.now(), ...rule }];
  return setStageAutomations(pipeline, stageId, rules);
}
export async function removeStageRule(pipeline, stageId, ruleId) {
  return setStageAutomations(pipeline, stageId, getStageAutomations(pipeline, stageId).filter((r) => r.id !== ruleId));
}
export async function updateStageRule(pipeline, stageId, ruleId, patch) {
  const rules = getStageAutomations(pipeline, stageId).map((r) => (r.id === ruleId ? { ...r, ...patch } : r));
  return setStageAutomations(pipeline, stageId, rules);
}

// Regla rápida.
const rule = (sid, n, when, action, to, title) => ({ id: `r_${sid}_${n}`, when, action, to, title });

// Siembra reglas por defecto en TODAS las etapas (flujo ISLAS SEM, como pidió el cliente).
// Detecta cada etapa por su nombre, así funciona aunque cambien los ids.
// FUSIONA: respeta las reglas que ya existan en cada etapa y solo rellena las vacías.
const SEED_VERSION = 2;
export async function seedDefaultAutomations(pipeline) {
  if (pipeline.automationsSeed === SEED_VERSION) return; // ya tiene la última tanda
  const existing = pipeline.automations || {};
  const stages = getStages(pipeline, "pos");
  const auto = { ...existing };
  const fill = (id, rules) => { if (!existing[id] || existing[id].length === 0) auto[id] = rules; };
  stages.forEach((s) => {
    const n = (s.name || "").toLowerCase();
    if (/prospecto/.test(n)) {
      fill(s.id, [
        rule(s.id, 1, "immediately", "notification", "responsible", "Nuevo prospecto asignado"),
        rule(s.id, 2, "1d", "task", "responsible", "Primer contacto en 24h"),
      ]);
    } else if (/cualific/.test(n)) {
      fill(s.id, [
        rule(s.id, 1, "1d", "task", "responsible", "Cualificar y llamar"),
        rule(s.id, 2, "3d", "control", "supervisor", "Revisar avance"),
      ]);
    } else if (/presupuesto|oferta/.test(n)) {
      fill(s.id, [
        rule(s.id, 1, "immediately", "task", "responsible", "Preparar y enviar presupuesto (PDF)"),
        rule(s.id, 2, "3d", "control", "responsible", "Seguimiento del presupuesto"),
      ]);
    } else if (/sepa/.test(n)) {
      fill(s.id, [
        rule(s.id, 1, "immediately", "form", "responsible", "Formulario SEPA (domiciliación)"),
        rule(s.id, 2, "7d", "control", "supervisor", "SEPA sin firmar"),
      ]);
    } else if (/contrato/.test(n)) {
      fill(s.id, [
        rule(s.id, 1, "immediately", "form", "responsible", "Enviar contrato a firmar"),
        rule(s.id, 2, "7d", "control", "responsible", "Contrato pendiente de firma"),
      ]);
    } else if (/equipo/.test(n)) {
      fill(s.id, [rule(s.id, 1, "immediately", "notification", "supervisor", "Nuevo cliente: arrancar onboarding")]);
    } else if (/satisfac/.test(n)) {
      fill(s.id, [rule(s.id, 1, "7d", "task", "responsible", "Pedir reseña / medir satisfacción")]);
    }
  });
  return crmUpdate("pipelines", pipeline.id, { automations: auto, automationsSeed: SEED_VERSION });
}

// ============================================================
//  DETECCIÓN DE RESPUESTA (SLA tipo Bitrix)
//  Al enviar una oferta se pone un reloj (offer.dueAt).
//  - Si el cliente responde  -> el estado deja de ser "enviada"
//    (hoy: botón "Respondió" · mañana: webhook de correo/WhatsApp)
//    -> el temporizador se cancela solo.
//  - Si NO responde a tiempo -> se dispara la automatización:
//    pasa a "Seguimiento activo", crea tarea y avisa al responsable.
// ============================================================

// Marca que el cliente respondió (para el botón y, en el futuro, el webhook).
export async function markResponded(deal, outcome = "respondio") {
  await crmUpdate("deals", deal.id, {
    offer: { ...(deal.offer || {}), state: outcome, respondedAt: Date.now() },
  });
  await logActivity(deal.orgId, {
    type: "Nota",
    title: `📥 El cliente respondió dentro de plazo`,
    entity: "deal",
    entityId: deal.id,
    contactId: deal.contactId || "",
  });
}

// Elige la columna del Kanban Negativo donde cae una negociación sin respuesta.
// Si venía de una etapa de contrato/SEPA -> grupo "Contrato"·72h; si no -> "Presupuesto"·72h.
// Devuelve { id, label } o null si el embudo no tiene tablero negativo.
export function pickNegTarget(pipeline, deal) {
  const negStages = getStages(pipeline, "neg");
  if (!negStages.length) return null;
  const posName = (findStage(getStages(pipeline, "pos"), deal.stage)?.name || "").toLowerCase();
  const wantContrato = /contrato|sepa|firma/.test(posName);
  const groupId = wantContrato ? "gc" : "gp";
  const group = negStages.find((s) => s.id === groupId && s.group) || negStages.find((s) => s.group);
  const sub = group?.sub?.[0]; // primer plazo (72 horas): reinicia el reloj de re-contacto
  if (group && sub) return { id: sub.id, label: `${group.name} · ${sub.name}` };
  // sin grupos: primera etapa negativa que no sea "perdido"
  const first = negStages.find((s) => !/perdid/i.test(s.name)) || negStages[0];
  return first ? { id: first.id, label: first.name } : null;
}

// Revisa TODAS las negociaciones y dispara la automatización en las que
// el plazo venció sin respuesta. Al no responder -> pasa al KANBAN NEGATIVO
// (columna de plazo) + tarea de re-contacto + registro. Devuelve cuántas escaló.
export async function runResponseWatch(deals, pipelines, orgId) {
  const now = Date.now();
  let fired = 0;
  for (const d of deals) {
    const o = d.offer;
    if (!o || o.state !== "enviada") continue;   // solo las que esperan respuesta
    if (!o.dueAt || now < o.dueAt) continue;      // aún dentro de plazo
    if (o.escalatedAt) continue;                  // ya escalada, no repetir
    if ((d.board || "pos") === "neg") continue;   // ya está en negativo
    const pipeline = (pipelines || []).find((p) => p.id === d.pipelineId) || (pipelines || [])[0];
    if (!pipeline) continue;
    const target = pickNegTarget(pipeline, d);
    try {
      await crmUpdate("deals", d.id, {
        board: "neg",
        stage: target ? target.id : d.stage,
        prevStage: d.stage,
        offer: { ...o, state: "seguimiento", escalatedAt: now },
      });
      await crmCreate("activities", orgId, {
        type: "Tarea",
        title: `☎ Sin respuesta en ${plazoTxt(o.plazoH)} · Re-contactar a ${d.contact || d.title}`,
        entity: "deal",
        entityId: d.id,
        contactId: d.contactId || "",
        dueDate: new Date().toISOString().slice(0, 10),
        assignee: d.responsable || "Responsable",
        done: false,
        auto: true,
      });
      await logActivity(orgId, {
        type: "Nota",
        title: `⏰ Automatización · Sin respuesta en ${plazoTxt(o.plazoH)} → movida al Kanban Negativo${target ? ` · ${target.label}` : ""}`,
        entity: "deal",
        entityId: d.id,
        contactId: d.contactId || "",
      });
      fired++;
    } catch (e) {
      console.warn("[responseWatch] no se pudo escalar:", e);
    }
  }
  return fired;
}

// EJECUTA las reglas de la etapa destino al mover una negociación.
export async function runStageAutomations(pipeline, deal, stageId, orgId) {
  const rules = getStageAutomations(pipeline, stageId);
  if (!rules.length) return 0;
  const stageName = findStage(getStages(pipeline, deal.board || "pos"), stageId)?.name || stageId;
  for (const r of rules) {
    const days = (WHEN_OPTS.find((w) => w[0] === r.when) || [])[2] || 0;
    const due = new Date();
    due.setDate(due.getDate() + days);
    const assignee = r.to === "supervisor" ? "Supervisor" : deal.responsable || "Responsable";
    // Tipo de actividad según la acción.
    const kind =
      r.action === "task" ? "Tarea"
      : r.action === "control" ? "Seguimiento"
      : r.action === "form" ? "Documento"
      : r.action === "email" ? "Email"
      : "Nota";
    // Prefijo visual: los envíos (form/email) se registran como enviados; el resto como automatización.
    const isSend = r.action === "form" || r.action === "email";
    const icon = r.action === "form" ? "📄" : r.action === "email" ? "✉️" : "⚙";
    const title = isSend
      ? `${icon} ${r.action === "form" ? "Enviado" : "Correo"}: ${r.title || actionLabel(r.action)} → ${deal.contact || assignee} (${stageName})`
      : `${icon} Automatización · ${r.title || actionLabel(r.action)} → ${assignee} (${deal.title} · ${stageName})`;
    try {
      await crmCreate("activities", orgId, {
        type: kind,
        title,
        entity: "deal",
        entityId: deal.id,
        contactId: deal.contactId || "",
        dueDate: due.toISOString().slice(0, 10),
        assignee,
        done: false,
        auto: true,
        // Marca los envíos como "pendiente de correo real" hasta que el backend de Loading los mande.
        ...(isSend ? { channelPending: true } : {}),
      });
      // Si la acción es un envío (formulario/correo), lo ENCOLA para el backend de Loading.
      if (isSend) {
        const t = (r.title || "").toLowerCase();
        const mkind = /sepa/.test(t) ? "sepa" : /contrato/.test(t) ? "contract" : /jur[íi]dic/.test(t) ? "juridicos" : r.action === "form" ? "form" : "email";
        // Enlace al formulario público rellenable (SEPA / Datos Jurídicos).
        const formPath = mkind === "sepa" ? "sepa" : mkind === "juridicos" ? "juridicos" : "";
        const base = (typeof window !== "undefined" && window.location?.origin) || "";
        const ctaUrl = formPath ? `${base}/f/${formPath}/${deal.id}` : "";
        await queueEmail(orgId, {
          to: deal.contactEmail || "",
          toName: deal.contact || "",
          subject: `${r.title || "Documento"} · ISLAS SEM`,
          kind: mkind,
          dealId: deal.id,
          contactId: deal.contactId || "",
          html: basicEmail({
            title: r.title || "Documento",
            body: `Hola ${deal.contact || ""},<br><br>En relación con <b>${deal.title}</b>, ${ctaUrl ? "necesitamos que completes el siguiente formulario" : "te enviamos"}: <b>${r.title || "documento"}</b>.`,
            cta: ctaUrl ? "Rellenar formulario" : "",
            ctaUrl,
          }),
        });
      }
    } catch (e) {
      console.warn("[automations] no se pudo ejecutar la regla:", e);
    }
  }
  await logActivity(orgId, {
    type: "Nota",
    title: `Automatización: ${rules.length} regla(s) ejecutada(s) en "${stageName}"`,
    entity: "deal",
    entityId: deal.id,
    contactId: deal.contactId || "",
  });
  return rules.length;
}
