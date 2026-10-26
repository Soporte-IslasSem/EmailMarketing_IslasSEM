// Cobro de la plataforma con Stripe (suscripción mensual por empresa), sin librerías: API REST de
// Stripe y firma del webhook comprobada aquí.
//
// .env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET y STRIPE_PRICE_BASICO / _PRO / _EMPRESA (id del
// precio de cada plan en Stripe). En Stripe › Webhooks: URL https://…/api/billing/webhook con los
// eventos checkout.session.completed, customer.subscription.created/updated/deleted e
// invoice.payment_failed.
//
// - Elegir plan (Mi empresa › Plan): Stripe Checkout; al pagar, el webhook activa el plan
//   (límites y módulos) y quita la suspensión.
// - Facturas y forma de pago: portal de cliente de Stripe.
// - Cambiar de plan: se cambia el precio de la suscripción (Stripe prorratea).
// - Impago definitivo o cancelación → empresa suspendida (sus datos se conservan).
// - Fin de la prueba gratis (cron): aviso 3 días antes y, al acabar sin plan, suspensión.
const crypto = require("crypto");
const { admin, db } = require("./firebase");
const { staffFromReq } = require("./access");
const tenant = require("./tenant");
const { planFields, PAID } = require("./plans");
const { brandMailHtml, esc } = require("./brandMail");

const STRIPE = (process.env.STRIPE_API_BASE || "https://api.stripe.com").replace(/\/$/, "");
const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
const FV = admin.firestore.FieldValue;
const priceOf = (plan) => process.env[`STRIPE_PRICE_${String(plan).toUpperCase()}`] || "";
const planOfPrice = (price) => PAID.find((p) => priceOf(p) && priceOf(p) === price) || "";
const CUSTOMERS = () => db.collection("billingCustomers");
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const configured = () => !!process.env.STRIPE_SECRET_KEY;

// Cuerpo application/x-www-form-urlencoded con la notación de Stripe (a[b][0][c]=…).
function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(path, { method = "GET", body } = {}) {
  const r = await fetch(`${STRIPE}/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? form(body).toString() : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.error) throw Object.assign(new Error(out.error?.message || `Stripe ${r.status}`), { status: 502 });
  return out;
}

async function adminUser(req, res) {
  const user = await staffFromReq(req, { allowSuspended: true });
  if (!user) { fail(res, "Sesión no válida", 401); return null; }
  if (!user.isAdmin) { fail(res, "Solo un administrador puede gestionar la suscripción", 403); return null; }
  if (!configured()) { fail(res, "El cobro aún no está activado en la plataforma.", 409); return null; }
  return user;
}

// Cliente de Stripe de la empresa (se crea la primera vez).
async function customerFor(user) {
  const org = await tenant.getOrg(user.orgId, { fresh: true });
  if (org.billing?.customerId) return org.billing.customerId;
  const c = await stripe("customers", { method: "POST", body: { email: org.ownerEmail || user.email, name: org.brand?.legalName || org.name, metadata: { orgId: user.orgId } } });
  await tenant.orgRef(user.orgId).set({ billing: { customerId: c.id } }, { merge: true });
  await CUSTOMERS().doc(c.id).set({ orgId: user.orgId, at: Date.now() });
  tenant.forgetOrg(user.orgId);
  return c.id;
}

// POST /api/billing/checkout { plan } → { url } de Stripe Checkout
async function checkout(req, res) {
  const user = await adminUser(req, res);
  if (!user) return;
  const plan = String(req.body?.plan || "");
  if (!PAID.includes(plan) || !priceOf(plan)) return fail(res, "Ese plan no está disponible");
  const customer = await customerFor(user);
  const s = await stripe("checkout/sessions", {
    method: "POST",
    body: {
      mode: "subscription", customer, client_reference_id: user.orgId, allow_promotion_codes: "true",
      line_items: { 0: { price: priceOf(plan), quantity: 1 } },
      subscription_data: { metadata: { orgId: user.orgId, plan } }, metadata: { orgId: user.orgId, plan },
      success_url: `${PUBLIC_URL}/dashboard/admin/empresa?tab=plan&pago=ok`,
      cancel_url: `${PUBLIC_URL}/dashboard/admin/empresa?tab=plan`,
      locale: "es",
    },
  });
  res.json({ ok: true, url: s.url });
}

// POST /api/billing/portal → { url } del portal de cliente (facturas, tarjeta, cancelar)
async function portal(req, res) {
  const user = await adminUser(req, res);
  if (!user) return;
  const org = await tenant.getOrg(user.orgId, { fresh: true });
  if (!org.billing?.customerId) return fail(res, "Aún no tienes ninguna suscripción");
  const s = await stripe("billing_portal/sessions", { method: "POST", body: { customer: org.billing.customerId, return_url: `${PUBLIC_URL}/dashboard/admin/empresa?tab=plan` } });
  res.json({ ok: true, url: s.url });
}

// POST /api/billing/change { plan } — cambia el precio de la suscripción activa (prorrateado).
async function change(req, res) {
  const user = await adminUser(req, res);
  if (!user) return;
  const plan = String(req.body?.plan || "");
  if (!PAID.includes(plan) || !priceOf(plan)) return fail(res, "Ese plan no está disponible");
  const org = await tenant.getOrg(user.orgId, { fresh: true });
  const subId = org.billing?.subscriptionId;
  if (!subId) return checkout(req, res);
  const sub = await stripe(`subscriptions/${subId}`);
  const item = sub.items?.data?.[0]?.id;
  if (!item) return fail(res, "No se encontró la suscripción");
  const upd = await stripe(`subscriptions/${subId}`, { method: "POST", body: { items: { 0: { id: item, price: priceOf(plan) } }, proration_behavior: "create_prorations", metadata: { orgId: user.orgId, plan } } });
  await applySubscription(upd, user.orgId);
  res.json({ ok: true });
}

/* ------------------------------------------------------------------ webhook */

// Firma Stripe-Signature: t=<seg>,v1=<hmac>; se acepta si coincide y tiene menos de 5 min.
function verifySignature(raw, header, secret) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(String(header).split(",").map((p) => p.split("=")).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const all = String(header).split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw.toString("utf8")}`).digest("hex");
  return all.some((v) => v.length === expected.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected)));
}

async function orgOfCustomer(customerId) {
  if (!customerId) return null;
  return (await CUSTOMERS().doc(String(customerId)).get()).data()?.orgId || null;
}

// Estado de la suscripción → empresa: plan (límites y módulos) y activa/suspendida.
async function applySubscription(sub, knownOrgId) {
  const orgId = knownOrgId || sub.metadata?.orgId || (await orgOfCustomer(sub.customer));
  if (!orgId) return null;
  const ref = tenant.orgRef(orgId);
  const org = (await ref.get()).data();
  if (!org) return null;
  const price = sub.items?.data?.[0]?.price?.id || "";
  const plan = planOfPrice(price) || sub.metadata?.plan || org.plan;
  const live = ["active", "trialing", "past_due"].includes(sub.status); // past_due: Stripe aún reintenta el cobro
  const ended = sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired";
  const patch = {
    billing: {
      ...(org.billing || {}), customerId: sub.customer, subscriptionId: sub.id, status: sub.status, plan,
      currentPeriodEnd: (sub.current_period_end || sub.items?.data?.[0]?.current_period_end || 0) * 1000 || null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end, updatedAt: Date.now(),
    },
  };
  if (live && PAID.includes(plan)) Object.assign(patch, planFields(plan), { status: "active", trialEndsAt: FV.delete() });
  if (ended && org.plan !== "interno") patch.status = "suspended";
  await ref.set(patch, { merge: true });
  if (sub.customer) await CUSTOMERS().doc(String(sub.customer)).set({ orgId, at: Date.now() }, { merge: true });
  tenant.forgetOrg(orgId);
  return orgId;
}

// POST /api/billing/webhook (cuerpo sin procesar)
async function webhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  if (!verifySignature(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) return res.sendStatus(400);
  let ev;
  try { ev = JSON.parse(raw.toString("utf8")); } catch { return res.sendStatus(400); }
  // Cada evento una sola vez (Stripe puede repetirlo).
  const seen = db.collection("billingEvents").doc(String(ev.id || "x").slice(0, 100));
  try { await seen.create({ type: ev.type, at: Date.now() }); } catch { return res.json({ received: true, duplicate: true }); }
  try {
    const o = ev.data?.object || {};
    if (ev.type === "checkout.session.completed" && o.subscription) {
      const orgId = o.client_reference_id || o.metadata?.orgId;
      if (orgId && o.customer) await CUSTOMERS().doc(String(o.customer)).set({ orgId, at: Date.now() }, { merge: true });
      await applySubscription(await stripe(`subscriptions/${o.subscription}`), orgId);
    } else if (ev.type.startsWith("customer.subscription.")) {
      await applySubscription(o);
    } else if (ev.type === "invoice.payment_failed") {
      const orgId = await orgOfCustomer(o.customer);
      if (orgId) {
        await tenant.orgRef(orgId).set({ billing: { lastPaymentFailedAt: Date.now() } }, { merge: true });
        await notifyAdmins(orgId, "No se pudo cobrar tu suscripción", "Stripe no ha podido cobrar la cuota de tu suscripción. Revisa la forma de pago para que tu cuenta no se suspenda.", "Revisar forma de pago", `${PUBLIC_URL}/dashboard/admin/empresa?tab=plan`);
      }
    }
    res.json({ received: true });
  } catch (e) {
    await seen.delete().catch(() => {}); // que Stripe lo reintente
    console.error("[billing] webhook:", ev.type, e.message);
    res.sendStatus(500);
  }
}

/* ------------------------------------------------------------------ prueba gratis (cron) */

async function notifyAdmins(orgId, title, text, cta, url) {
  const org = await tenant.getOrg(orgId, { fresh: true });
  const to = [...new Set([...(org?.adminEmails || []), org?.ownerEmail].filter(Boolean).map(tenant.norm))];
  for (const email of to) {
    await db.collection("outbox").add({
      orgId: tenant.DEFAULT_ORG_ID, to: email, subject: `${org?.name || "Tu empresa"}: ${title}`, kind: "billing", status: "pending", attempts: 0, error: "", sentAt: null, createdAt: new Date(),
      html: brandMailHtml(tenant.brandOf({ id: tenant.DEFAULT_ORG_ID }), { title, body: `Hola,<br><br>${esc(text)}`, cta, ctaUrl: url }),
    });
  }
}

// Avisa 3 días antes de que acabe la prueba y suspende al acabar si no hay plan de pago.
async function runTrials() {
  // Sin cobro configurado no se suspende a nadie (no tendrían cómo pagar).
  if (!configured()) return { skipped: "Stripe sin configurar" };
  const now = Date.now();
  const snap = await db.collection("organizations").where("plan", "==", "trial").get();
  let warned = 0, suspended = 0;
  for (const d of snap.docs) {
    const o = d.data();
    if (!o.trialEndsAt || o.status === "suspended") continue;
    if (["active", "trialing"].includes(o.billing?.status)) continue;
    if (now >= o.trialEndsAt) {
      await d.ref.set({ status: "suspended", suspendedReason: "trial", suspendedAt: now }, { merge: true });
      tenant.forgetOrg(d.id);
      await notifyAdmins(d.id, "tu prueba gratis ha terminado", "Tu prueba gratis ha terminado. Elige un plan para seguir usando la plataforma: tus datos se conservan.", "Elegir plan", `${PUBLIC_URL}/suscripcion`);
      suspended++;
    } else if (o.trialEndsAt - now < 3 * 864e5 && !o.trialWarnedAt) {
      await d.ref.set({ trialWarnedAt: now }, { merge: true });
      await notifyAdmins(d.id, "tu prueba gratis acaba pronto", `Tu prueba gratis termina el ${new Date(o.trialEndsAt).toLocaleDateString("es-ES")}. Elige un plan para no perder el acceso.`, "Elegir plan", `${PUBLIC_URL}/dashboard/admin/empresa?tab=plan`);
      warned++;
    }
  }
  return { warned, suspended };
}

module.exports = { checkout, portal, change, webhook, runTrials, verifySignature, applySubscription };
