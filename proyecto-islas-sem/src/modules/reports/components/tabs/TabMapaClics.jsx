export default function TabMapaClics({ report }) {
  const subs = Object.entries(report.subscribers || {}).map(([email, info]) => ({
    email,
    clicked: info.clicked || false,
    clickedAt: info.clickedAt ? new Date(info.clickedAt).toLocaleString() : null,
    lastUrl: info.lastClickedUrl || null,
    clickedUrls: info.clickedUrls || [],
  }));

  const clics = subs
    .filter(s => s.clicked)
    .sort((a, b) => new Date(b.clickedAt) - new Date(a.clickedAt)); // más recientes primero

  return (
    <div className="TabMapaClics">
      <h2>Mapa de clics</h2>

      {clics.length === 0 ? (
        <p>No se han registrado clics en esta campaña.</p>
      ) : (
        <table className="ReportDetail__table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Último clic</th>
              <th>URL clicada</th>
              <th>Total clics</th>
              <th>Historial</th>
            </tr>
          </thead>
          <tbody>
            {clics.map((c, i) => (
              <tr key={i}>
                <td>{c.email}</td>
                <td>{c.clickedAt || "Desconocido"}</td>
                <td>{c.lastUrl || "No disponible"}</td>
                <td>{c.clickedUrls.length}</td>
                <td>
                  {c.clickedUrls.length > 0
                    ? c.clickedUrls.join(", ")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
