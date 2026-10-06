import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCrmCollection, fmtDate } from "../lib/crm";
import "../crm.styles.css";

// Historial de CRM: toda la comunicación con clientes (correos, formularios,
// llamadas, notas) en una sola línea de tiempo, con enlace a la ficha.
const TYPES = ["Todos", "Email", "Formulario", "Llamada", "Reunión", "Nota", "Tarea", "Seguimiento"];
const ICON = { Email: "✉️", Formulario: "📋", Llamada: "📞", Reunión: "🤝", Nota: "📝", Tarea: "✅", Seguimiento: "🔁" };

export default function History() {
  const { items, loading } = useCrmCollection("activities");
  const { items: contacts } = useCrmCollection("contacts");
  const { items: leads } = useCrmCollection("leads");
  const { items: deals } = useCrmCollection("deals");
  const [type, setType] = useState("Todos");
  const [term, setTerm] = useState("");
  const [limit, setLimit] = useState(100);

  const names = useMemo(() => {
    const m = {};
    contacts.forEach((c) => (m[`contact:${c.id}`] = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email));
    leads.forEach((l) => (m[`lead:${l.id}`] = `${l.firstName || ""} ${l.lastName || ""}`.trim() || l.email));
    deals.forEach((d) => (m[`deal:${d.id}`] = d.title));
    return m;
  }, [contacts, leads, deals]);

  const target = (a) => {
    if (a.contactId) return { label: names[`contact:${a.contactId}`] || "Contacto", to: `/dashboard/crm/contacts/${a.contactId}` };
    if (a.entity === "deal" && a.entityId) return { label: names[`deal:${a.entityId}`] || "Negociación", to: `/dashboard/crm/deals/${a.entityId}` };
    const leadId = a.leadId || (a.entity === "lead" && a.entityId);
    if (leadId) return { label: `Prospecto · ${names[`lead:${leadId}`] || ""}`, to: "/dashboard/crm/leads" };
    return null;
  };

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return items
      .filter((a) => type === "Todos" || a.type === type)
      .filter((a) => !t || [a.title, a.from, a.subject, a.body].some((v) => String(v || "").toLowerCase().includes(t)))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [items, type, term]);

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Historial de CRM</h1>
          <p>Toda la comunicación con clientes y prospectos · {rows.length} registros</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {TYPES.map((t) => (
          <button key={t} className={`crm-btn sm ${type === t ? "" : "ghost"}`} onClick={() => setType(t)}>
            {ICON[t] ? `${ICON[t]} ` : ""}{t}
          </button>
        ))}
      </div>
      <input className="crm-search" placeholder="Buscar en asunto, remitente o contenido…" value={term} onChange={(e) => setTerm(e.target.value)} />
      {loading ? (
        <div className="crm-loading">Cargando historial…</div>
      ) : rows.length ? (
        <div className="crm-panel">
          <ul className="crm-timeline">
            {rows.slice(0, limit).map((a) => {
              const t = target(a);
              return (
                <li key={a.id} className="crm-tl-item">
                  <span className="dot" />
                  <div className="tl-t">{ICON[a.type] || "•"} {a.title}</div>
                  {a.body && (
                    <details style={{ fontSize: 13, color: "var(--crm-muted)" }}>
                      <summary style={{ cursor: "pointer" }}>Ver contenido{a.from ? ` · ${a.from}` : ""}</summary>
                      <div style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto", marginTop: 6, color: "#2a3a3a" }}>{a.body}</div>
                    </details>
                  )}
                  <div className="tl-m">
                    {fmtDate(a.createdAt)}
                    {t && <> · <Link to={t.to}>{t.label}</Link></>}
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > limit && (
            <button className="crm-btn ghost sm" onClick={() => setLimit((l) => l + 200)}>Ver más ({rows.length - limit})</button>
          )}
        </div>
      ) : (
        <div className="crm-empty">Sin registros con ese filtro.</div>
      )}
    </div>
  );
}
