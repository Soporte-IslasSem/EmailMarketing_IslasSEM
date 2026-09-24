import "./TabAvanzado.styles.css";

export default function TabAvanzado({ report }) {
  return (
    <div className="TabAvanzado">
      <h2>Métricas avanzadas</h2>

      <table className="ReportDetail__table">
        <thead>
          <tr>
            <th>Métrica</th>
            <th>Cantidad</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Rebotes suaves</td>
            <td>{report.stats?.softBounces || 0}</td>
          </tr>
          <tr>
            <td>Rebotes duros</td>
            <td>{report.stats?.hardBounces || 0}</td>
          </tr>
          <tr>
            <td>Quejas</td>
            <td>{report.stats?.complaints || 0}</td>
          </tr>
          <tr>
            <td>Rebotes totales</td>
            <td>{report.stats?.bounces || 0}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
