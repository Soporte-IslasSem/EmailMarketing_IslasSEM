import "./PlatformSection.styles.css";

export default function PlatformSection() {
  return (
    <section className="PlatformSection">
      <div className="PlatformSection__container">
        <h2 className="PlatformSection__title">
          Todo en una sola plataforma
        </h2>

        <p className="PlatformSection__subtitle">
          Centraliza tus comunicaciones, automatizaciones y análisis en un único lugar.
        </p>

        <div className="PlatformSection__grid">
          <div className="PlatformSection__item">
            <h3 className="PlatformSection__itemTitle">Campañas de Email</h3>
            <p className="PlatformSection__itemText">
              Diseña campañas profesionales, segmenta tu audiencia y mide resultados.
            </p>
          </div>

          <div className="PlatformSection__item">
            <h3 className="PlatformSection__itemTitle">Listas y Segmentación</h3>
            <p className="PlatformSection__itemText">
              Organiza a tus suscriptores en listas y segmentos personalizados.
            </p>
          </div>

          <div className="PlatformSection__item">
            <h3 className="PlatformSection__itemTitle">Plantillas y Editor Visual</h3>
            <p className="PlatformSection__itemText">
              Crea emails a golpe de clic con nuestro editor de arrastrar y soltar.
            </p>
          </div>

          <div className="PlatformSection__item">
            <h3 className="PlatformSection__itemTitle">Formularios</h3>
            <p className="PlatformSection__itemText">
              Capta nuevos suscriptores con formularios integrados en tu web.
            </p>
          </div>

          <div className="PlatformSection__item">
            <h3 className="PlatformSection__itemTitle">Automatizaciones</h3>
            <p className="PlatformSection__itemText">
              Ahorra tiempo con flujos inteligentes que trabajan por ti.
            </p>
          </div>

          <div className="PlatformSection__item">
            <h3 className="PlatformSection__itemTitle">Informes y Analítica</h3>
            <p className="PlatformSection__itemText">
              Obtén métricas claras para tomar decisiones basadas en datos.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
