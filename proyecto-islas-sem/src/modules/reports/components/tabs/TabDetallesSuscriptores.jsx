import { useState } from "react";
import "./TabDetallesSuscriptores.styles.css";

export default function TabDetallesSuscriptores({ report }) {
  const formatDate = (dateObj) => {
    if (!dateObj) return "Sin actividad";
    if (typeof dateObj === "string") return dateObj;
    if (dateObj.seconds) return new Date(dateObj.seconds * 1000).toLocaleString();
    return "Sin actividad";
  };

  // 🔹 Estado por destinatario: envío (results) + aperturas/clics/rebotes (subscribers),
  // ambos escritos por el backend.
  const ms = (v) => (v ? new Date(v).toLocaleString() : "Sin actividad");
  const subs = (report.results || []).map((r) => {
    const s = report.subscribers?.[r.email] || {};
    const last = Math.max(s.clickedAt || 0, s.lastOpenedAt || s.openedAt || 0, s.sentAt || 0);
    return {
      email: r.email,
      status: s.bounced ? `rebotado (${s.bounceType === "hard" ? "definitivo" : "temporal"})` : r.status || "desconocido",
      opened: s.opened ? `Abierto${s.openCount > 1 ? ` (${s.openCount})` : ""}` : "Sin abrir",
      clicked: s.clicked ? `Clic${s.clickCount > 1 ? ` (${s.clickCount})` : ""}` : "Sin clic",
      lastAction: last ? ms(last) : formatDate(report.sentAt),
      sentAt: s.sentAt ? ms(s.sentAt) : formatDate(report.sentAt),
      openedAt: ms(s.openedAt),
      clickedAt: ms(s.clickedAt),
    };
  });

  // 🔹 Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(subs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentSubs = subs.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="TabDetallesSuscriptores">
      <h2>Detalles de suscriptores</h2>

      {subs.length === 0 ? (
        <p>No hay datos de suscriptores.</p>
      ) : (
        <>
          <table className="ReportDetail__table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Estado</th>
                <th>Apertura</th>
                <th>Clic</th>
                <th>Última acción</th>
                <th>Enviado</th>
                <th>Fecha apertura</th>
                <th>Fecha clic</th>
              </tr>
            </thead>
            <tbody>
              {currentSubs.map((s, i) => (
                <tr key={i}>
                  <td>{s.email}</td>
                  <td>{s.status}</td>
                  <td>{s.opened}</td>
                  <td>{s.clicked}</td>
                  <td>{s.lastAction}</td>
                  <td>{s.sentAt}</td>
                  <td>{s.openedAt}</td>
                  <td>{s.clickedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 🔹 Controles de paginación */}
          <div className="pagination">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
               Anterior
            </button>
            <span>
              Página {currentPage} de {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Siguiente 
            </button>
          </div>
        </>
      )}
    </div>
  );
}
