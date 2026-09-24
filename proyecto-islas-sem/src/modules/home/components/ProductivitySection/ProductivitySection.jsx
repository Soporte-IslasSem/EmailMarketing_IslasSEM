import "./ProductivitySection.styles.css";

export default function ProductivitySection() {
  return (
    <section className="ProductivitySection">
      <div className="ProductivitySection__container">
        <h2 className="ProductivitySection__title">
          Innovación e inteligencia para potenciar tu productividad
        </h2>

        <p className="ProductivitySection__subtitle">
          Herramientas diseñadas para ayudarte a trabajar mejor, más rápido y con mayor claridad.
        </p>

        <div className="ProductivitySection__grid">
          <div className="ProductivitySection__item">
            <h3 className="ProductivitySection__itemTitle">Automatizaciones inteligentes</h3>
            <p className="ProductivitySection__itemText">
              Crea flujos que trabajan por ti y optimizan tus procesos diarios.
            </p>
          </div>

          <div className="ProductivitySection__item">
            <h3 className="ProductivitySection__itemTitle">Panel de control unificado</h3>
            <p className="ProductivitySection__itemText">
              Visualiza métricas clave y toma decisiones basadas en datos reales.
            </p>
          </div>

          <div className="ProductivitySection__item">
            <h3 className="ProductivitySection__itemTitle">Integraciones fluidas</h3>
            <p className="ProductivitySection__itemText">
              Conecta tus herramientas favoritas y centraliza tu trabajo.
            </p>
          </div>

          <div className="ProductivitySection__item">
            <h3 className="ProductivitySection__itemTitle">Ahorro de tiempo</h3>
            <p className="ProductivitySection__itemText">
              Reduce tareas repetitivas y enfócate en lo que realmente importa.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
