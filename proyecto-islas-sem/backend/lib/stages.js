// Utilidades de etapas de embudo (compartidas por SLA e Inbox).
const getStages = (pipeline, board) => (board === "neg" ? pipeline.negStages : pipeline.stages) || [];

function flattenStages(stages) {
  const out = [];
  (stages || []).forEach((s) => (s.group && s.sub ? s.sub.forEach((ss) => out.push(ss)) : out.push(s)));
  return out;
}

function findStage(stages, sid) {
  for (const s of stages || []) {
    if (s.id === sid) return s;
    if (s.group && s.sub) { const f = s.sub.find((x) => x.id === sid); if (f) return f; }
  }
  return null;
}

// Siguiente etapa del tablero positivo (para avanzar al responder).
function nextPosStage(pipeline, currentStageId) {
  const flat = flattenStages(getStages(pipeline, "pos"));
  const i = flat.findIndex((s) => s.id === currentStageId);
  if (i < 0) return null;
  return flat[Math.min(i + 1, flat.length - 1)] || null;
}

// Columna del Kanban Negativo donde cae una oferta sin respuesta.
function pickNegTarget(pipeline, deal) {
  const negStages = getStages(pipeline, "neg");
  if (!negStages.length) return null;
  const posName = (findStage(getStages(pipeline, "pos"), deal.stage)?.name || "").toLowerCase();
  const groupId = /contrato|sepa|firma/.test(posName) ? "gc" : "gp";
  const group = negStages.find((s) => s.id === groupId && s.group) || negStages.find((s) => s.group);
  const sub = group?.sub?.[0];
  if (group && sub) return { id: sub.id, label: `${group.name} · ${sub.name}` };
  const first = negStages.find((s) => !/perdid/i.test(s.name)) || negStages[0];
  return first ? { id: first.id, label: first.name } : null;
}

const plazoTxt = (h) => (h && h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h || 72}h`);

module.exports = { getStages, flattenStages, findStage, nextPosStage, pickNegTarget, plazoTxt };
