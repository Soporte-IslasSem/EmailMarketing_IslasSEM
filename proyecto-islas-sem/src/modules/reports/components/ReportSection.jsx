import "./ReportSection.styles.css";
import PieChartReport from "../../../charts/PieChartReport.jsx";



export default function ReportSection({ title, data, colors }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="ReportSection">
      <h2 className="ReportSection__title">{title}</h2>

      <div className="ReportSection__content">
        {/* Tabla */}
        <table className="ReportSection__table">
          <thead>
            <tr>
              <th>Acción</th>
              <th>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index}>
                <td>{item.label}</td>
                <td>{item.value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Gráfico circular */}
        <div className="ReportSection__chart">
          <PieChartReport data={data} colors={colors} total={total} />
        </div>
      </div>

      <p className="ReportSection__info">
        ¿Quieres saber qué significa cada uno de estos datos?{" "}
        <span className="ReportSection__link">Más información</span>
      </p>
    </div>
  );
}
