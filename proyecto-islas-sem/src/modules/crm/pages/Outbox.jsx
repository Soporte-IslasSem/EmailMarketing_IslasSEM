import { useMemo, useState } from "react";
import { useCrmCollection, crmRemove, fmtDate } from "../lib/crm";
import { OUTBOX_STATUS, requeueEmail } from "../lib/outbox";
import "../crm.styles.css";

const KIND_LABEL = {
  offer: "Presupuesto", sepa: "SEPA", contract: "Contrato",
  form: "Formulario", campaign: "Campaña", notification: "Aviso", email: "Correo",
};

export default function Outbox() {
  const { items, loading } = useCrmCollection("outbox");
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    const sorted = [...items].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return filter === "all" ? sorted : sorted.filter((m) => m.status === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    const c = { all: items.length, pending: 0, sent: 0, failed: 0, skipped: 0 };
    items.forEach((m) => { c[m.status] = (c[m.status] || 0) + 1; });
    return c;
  }, [items]);

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Bandeja de salida</h1>
          <p>Correos encolados. El backend de Loading los enviará y marcará como enviados.</p>
        </div>
      </div>

      {counts.pending > 0 && (
        <div className="crm-panel" style={{ background: "#fff7e6", borderColor: "#f0dca8", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>⏳</span>
          <span style={{ fontSize: 14 }}><b>{counts.pending}</b> correo(s) en cola esperando al backend de envío (SMTP de Loading). Se enviarán automáticamente en cuanto esté conectado.</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, margin: "4px 0 14px", flexWrap: "wrap" }}>
        {[["all", "Todos"], ["pending", "En cola"], ["sent", "Enviados"], ["failed", "Fallidos"], ["skipped", "Omitidos"]].map(([k, l]) => (
          <button key={k} className={`crm-chip ${filter === k ? "info" : ""}`} style={{ cursor: "pointer", border: filter === k ? "none" : "1px solid var(--crm-line,#e3eaea)" }} onClick={() => setFilter(k)}>
            {l} ({counts[k] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="crm-loading">Cargando…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr><th>Estado</th><th>Tipo</th><th>Para</th><th>Asunto</th><th>Adjunto</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((m) => {
              const st = OUTBOX_STATUS[m.status] || OUTBOX_STATUS.pending;
              return (
                <tr key={m.id}>
                  <td><span className={`crm-chip ${st.cls}`}>{st.label}</span></td>
                  <td>{KIND_LABEL[m.kind] || m.kind}</td>
                  <td>{m.to || <span style={{ color: "var(--crm-muted)" }}>— sin email —</span>}{m.toName ? <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{m.toName}</div> : null}</td>
                  <td>{m.subject}</td>
                  <td>{m.attachment ? "📎 PDF" : "—"}</td>
                  <td>{fmtDate(m.createdAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {(m.status === "failed" || m.status === "skipped") && (
                      <button className="crm-btn sm" onClick={() => requeueEmail(m.id)} title="Volver a poner en cola">↻ Reintentar</button>
                    )}{" "}
                    <button className="crm-btn ghost sm" onClick={() => window.confirm("¿Eliminar de la cola?") && crmRemove("outbox", m.id)}>✕</button>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan="7" className="crm-empty">No hay correos en esta vista.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
