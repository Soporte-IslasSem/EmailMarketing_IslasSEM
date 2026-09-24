import "./Hero.styles.css";
import ParticlesBackground from "./ParticlesBackground";

export default function Hero() {
  return (
    <section className="Hero">
      <div className="Hero__overlay" />

      <ParticlesBackground />

      <div className="Hero__content">
        <h1 className="Hero__title">
          Email marketing fácil, potente y diseñado para crecer
        </h1>

        <p className="Hero__subtitle">
          Influir positivamente cuidando tu negocio
        </p>

        <div className="Hero__actions">
          <a
            href="https://islassem.com/videoconferencia"
            className="Hero__btn Hero__btn--outline"
          >
            Acceso a videoconferencia
          </a>

          <a
            href="https://islassem.com/agenda"
            className="Hero__btn Hero__btn--primary"
          >
            Concertar una reunión
          </a>

          <a
            href="https://islassem.com/clientes"
            className="Hero__btn Hero__btn--secondary"
          >
            Área de clientela
          </a>
        </div>
      </div>
    </section>
  );
}
