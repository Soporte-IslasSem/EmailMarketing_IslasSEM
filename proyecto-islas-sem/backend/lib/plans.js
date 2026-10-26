// Planes de la plataforma: límites y módulos de cada uno. El precio y el cobro están en Stripe
// (billing.js, con el id de precio de cada plan en STRIPE_PRICE_<PLAN>).
// - trial: prueba gratis al darse de alta (TRIAL_DAYS días), con los módulos del plan Pro.
// - interno: empresas de la casa (ISLAS SEM), sin límites ni cobro.
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS) || 14;

const PLANS = {
  trial: { name: "Prueba gratis", users: 3, emailsPerDay: 100, features: { whatsapp: true, contracts: true, gcal: true } },
  basico: { name: "Básico", users: 3, emailsPerDay: 300, features: { whatsapp: false, contracts: false, gcal: true } },
  pro: { name: "Pro", users: 10, emailsPerDay: 1000, features: { whatsapp: true, contracts: true, gcal: true } },
  empresa: { name: "Empresa", users: 50, emailsPerDay: 3000, features: { whatsapp: true, contracts: true, gcal: true } },
  interno: { name: "Interno", users: 1000, emailsPerDay: 100000, features: { whatsapp: true, contracts: true, gcal: true, talentoDigital: true, restaurants: true } },
};
const PAID = ["basico", "pro", "empresa"];

// Lo que se guarda en la empresa al cambiar de plan (límites y módulos).
function planFields(plan) {
  const p = PLANS[plan] || PLANS.trial;
  return { plan: PLANS[plan] ? plan : "trial", limits: { users: p.users, emailsPerDay: p.emailsPerDay }, features: { ...p.features } };
}

// Para la app (Mi empresa › Plan y la página de precios).
const publicPlans = () => Object.entries(PLANS).filter(([id]) => PAID.includes(id)).map(([id, p]) => ({
  id, name: p.name, users: p.users, emailsPerDay: p.emailsPerDay, features: p.features,
  available: !!process.env[`STRIPE_PRICE_${id.toUpperCase()}`],
}));

module.exports = { PLANS, PAID, TRIAL_DAYS, planFields, publicPlans };
