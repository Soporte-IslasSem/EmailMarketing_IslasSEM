import { useState } from "react";
import "./TabSeguimientoURLs.styles.css";

export default function TabSeguimientoURLs({ report }) {
  const subs = Object.values(report.subscribers || {});

  const urlMap = {};

  subs.forEach(info => {
    if (Array.isArray(info.clickedUrls)) {
      info.clickedUrls.forEach(url => {
        if (!urlMap[url]) urlMap[url] = 0;
        urlMap[url] += 1;
      });
    }
  });

  const totalClicks = Object.values(urlMap).reduce((a, b) => a + b, 0);

  const urls = Object.entries(urlMap)
    .map(([url, clicks]) => ({
      url,
      clicks,
      percent: totalClicks > 0 ? ((clicks / totalClicks) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks);

  // 🔹 Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(urls.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentUrls = urls.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="TabSeguimientoURLs">
      <h2>Seguimiento de URLs</h2>

      {urls.length === 0 ? (
        <p>No hay URLs registradas.</p>
      ) : (
        <>
          <table className="ReportDetail__table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Clics</th>
                <th>Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {currentUrls.map((u, i) => (
                <tr key={i}>
                  <td>{u.url}</td>
                  <td>{u.clicks}</td>
                  <td>{u.percent}%</td>
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
