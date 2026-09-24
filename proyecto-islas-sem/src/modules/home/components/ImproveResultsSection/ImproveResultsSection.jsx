import "./ImproveResultsSection.styles.css";

export default function ImproveResultsSection() {
  return (
    <section className="Improve">
      <div className="Improve__container">

        <div className="Improve__text">
          <h2 className="Improve__title">Innovación e inteligencia en tu organización</h2>
          <p className="Improve__subtitle">
            El motor del cambio es ahora. Aumenta tu productividad cambiando hábitos y optimizando procesos.
          </p>
        </div>

        <div className="Improve__graph">
          <img src="/images/grafica-transformacion.png" alt="Transformación digital" />
        </div>

      </div>
    </section>
  );
}
