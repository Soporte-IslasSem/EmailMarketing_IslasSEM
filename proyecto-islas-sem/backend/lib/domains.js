// Comprobación de dominios de email (para "Depurar emails" en Listas › Herramientas).
// Un dominio "acepta correo" si tiene registros MX (o, en su defecto, A/AAAA, que es el
// respaldo que usan los servidores de correo). Solo para usuarios con sesión de la app.
const dns = require("dns").promises;
const { admin } = require("./firebase");

const cache = new Map(); // dominio -> { ok, at }
const TTL = 6 * 3600e3;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function domainAcceptsMail(domain) {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL) return hit.ok;
  let ok = false;
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 5000);
    ok = mx.some((r) => r.exchange && r.exchange !== ".");
  } catch (e) {
    if (e.code === "ENODATA") {
      try { ok = (await withTimeout(dns.resolve(domain), 5000)).length > 0; } catch { ok = false; }
    } else if (e.message === "timeout" || e.code === "ETIMEOUT" || e.code === "ESERVFAIL") {
      ok = true; // error temporal de DNS: no se marca como inválido
    }
  }
  cache.set(domain, { ok, at: Date.now() });
  return ok;
}

// POST /api/lists/check-domains  { domains: ["gmail.com", ...] }  (Authorization: Bearer <idToken>)
async function checkDomains(req, res) {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Sin sesión" });
    await admin.auth().verifyIdToken(token);
    const domains = [...new Set((req.body?.domains || []).map((d) => String(d).trim().toLowerCase()))]
      .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
      .slice(0, 300);
    const result = {};
    for (let i = 0; i < domains.length; i += 20) {
      const chunk = domains.slice(i, i + 20);
      const oks = await Promise.all(chunk.map(domainAcceptsMail));
      chunk.forEach((d, j) => { result[d] = oks[j]; });
    }
    res.json({ ok: true, result });
  } catch (e) {
    const auth = /token|auth/i.test(e.code || e.message || "");
    res.status(auth ? 401 : 500).json({ error: auth ? "Sesión no válida" : "Error interno" });
  }
}

module.exports = { checkDomains, domainAcceptsMail };
