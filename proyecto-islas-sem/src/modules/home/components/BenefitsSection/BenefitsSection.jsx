import "./BenefitsSection.styles.css";

const benefits = [
  {
    icon: "/icons/optimiza.svg",
    title: "Optimiza tus procesos",
    text: "Digitalizamos tu negocio para que ahorres tiempo y aumentes tu productividad."
  },
  {
    icon: "/icons/seguridad.svg",
    title: "Protección de datos",
    text: "Cumplimiento normativo y seguridad para tu empresa en la era digital."
  },
  {
    icon: "/icons/consultoria.svg",
    title: "Consultoría estratégica",
    text: "Te acompañamos en la toma de decisiones tecnológicas clave."
  },
  {
    icon: "/icons/automatizacion.svg",
    title: "Automatización inteligente",
    text: "Implementamos listas segmentadas y automatizaciones que impulsan tu negocio."
  }
];

export default function BenefitsSection() {
  return (
    <section className="Benefits">
      <div className="Benefits__container">
        {benefits.map((b, i) => (
          <div key={i} className="Benefits__card">
            <img src={b.icon} alt={b.title} className="Benefits__icon" />
            <h3 className="Benefits__title">{b.title}</h3>
            <p className="Benefits__text">{b.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
