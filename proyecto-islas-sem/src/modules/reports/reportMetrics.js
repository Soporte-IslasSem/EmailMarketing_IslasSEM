// Métricas reales del informe (las escribe el backend: envíos, pixel de apertura y clics).
// Aperturas y clics son únicos por destinatario, como en Acumbamail.
export function reportMetrics(r) {
  const subs = Object.values(r.subscribers || {});
  const results = Array.isArray(r.results) ? r.results : [];
  const sent = r.stats?.sent ?? (results.filter((x) => x.status === "sent").length || r.totalRecipients || 0);
  const opened = subs.filter((s) => s.opened).length;
  const clicked = subs.filter((s) => s.clicked).length;
  const replied = subs.filter((s) => s.replied).length;
  const pct = (n) => (sent ? Math.round((n / sent) * 1000) / 10 : 0);
  return {
    sent, opened, clicked, replied, openRate: pct(opened), clickRate: pct(clicked), replyRate: pct(replied),
    bounces: r.stats?.bounces || 0,
  };
}
