import ReportSection from "../ReportSection";

export default function TabResumen({ report }) {
  // Cálculos reales basados en Firestore
  const total = report.totalSent || 0;
  const abiertos = report.totalOpened || 0;
  const clics = report.totalClicked || 0;
  const errores = report.totalErrors || 0;

  const sinAbrir = total - abiertos;
  const tasaApertura = total > 0 ? ((abiertos / total) * 100).toFixed(1) + "%" : "0%";
  const tasaClic = total > 0 ? ((clics / total) * 100).toFixed(1) + "%" : "0%";

  return (
    <div className="TabResumen">
      {/* Estado de correos entregados */}
      <ReportSection
        title="Estado de los correos entregados"
        data={[
          { label: "Sin abrir", value: sinAbrir },
          { label: "Abiertos", value: abiertos },
          { label: "Clics", value: clics },
        ]}
        colors={["#136B68", "#1A9190", "#E2B83C"]}
      />

      {/* Estado de los correos enviados */}
      <ReportSection
        title="Estado de los correos enviados"
        data={[
          { label: "Enviados", value: total },
          { label: "Errores", value: errores },
        ]}
        colors={["#1A9190", "#D9534F"]}
      />

      {/* Información general */}
      <div className="TabResumen__general">
        <h2>Información general</h2>

        <table className="ReportDetail__table">
          <tbody>
            <tr>
              <td>Total enviados</td>
              <td>{total}</td>
            </tr>

            <tr>
              <td>Errores de entrega</td>
              <td>{errores}</td>
            </tr>

            <tr>
              <td>Abiertos</td>
              <td>{abiertos}</td>
            </tr>

            <tr>
              <td>Han hecho clic</td>
              <td>{clics}</td>
            </tr>

            <tr>
              <td>Tasa de apertura</td>
              <td>{tasaApertura}</td>
            </tr>

            <tr>
              <td>Tasa de clic</td>
              <td>{tasaClic}</td>
            </tr>

            <tr>
              <td>Última apertura</td>
              <td>{report.lastOpened || "Nunca"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
