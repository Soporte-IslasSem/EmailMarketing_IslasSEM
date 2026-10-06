import { useMemo, useState } from "react";
import { useCrmCollection, fmtDate } from "../lib/crm";
import "../crm.styles.css";

const TYPE_COLOR = { Email: "info", Nota: "warn", Tarea: "ok", Llamada: "info", Reunión: "ok", Seguimiento: "warn" };

export default function Audit() {
  const { items, loading } = useCrmCollection("activities");
  const [term, setTerm] = useState("");

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    let r = [...items].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (t) r = r.filter((a) => [a.type, a.title, a.entity].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
    return r;
  }, [items, term]);

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Registro / Auditoría</h1>
          <p>Historial cronológico de acciones del CRM (creaciones, cambios de etapa, ofertas, notas…).</p>
        </div>
      </div>

      <input className="crm-search" placeholder="Buscar en el registro…" value={term} onChange={(e) => setTerm(e.target.value)} />

      {loading ? (
        <div className="crm-loading">Cargando registro…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr><th>Tipo</th><th>Descripción</th><th>Entidad</th><th>Fecha</th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((a) => (
              <tr key={a.id}>
                <td><span className={`crm-chip ${TYPE_COLOR[a.type] || ""}`}>{a.type || "Evento"}</span></td>
                <td>{a.title || "—"}</td>
                <td>{a.entity ? `${a.entity}${a.entityId ? " · " + a.entityId.slice(0, 6) : ""}` : "—"}</td>
                <td>{fmtDate(a.createdAt)}</td>
              </tr>
            )) : <tr><td colSpan="4" className="crm-empty">Aún no hay eventos registrados.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
