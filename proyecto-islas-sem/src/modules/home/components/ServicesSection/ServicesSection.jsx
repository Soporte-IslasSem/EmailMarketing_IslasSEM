import "./ServicesSection.styles.css";

import emailIcon from "../../../../assets/icons/email.svg";
import smsIcon from "../../../../assets/icons/sms.svg";
import landingIcon from "../../../../assets/icons/landing.svg";
import automationIcon from "../../../../assets/icons/automation.svg";

export default function ServicesSection() {
  const services = [
    {
      title: "Campañas de Email",
      description: "Crea campañas profesionales en minutos y conecta con tu audiencia.",
      icon: emailIcon,
      link: "#"
    },
    {
      title: "Listas y Segmentación",
      description: "Organiza a tus suscriptores para llegar siempre al público correcto.",
      icon: smsIcon,
      link: "#"
    },
    {
      title: "Plantillas y Editor Visual",
      description: "Diseña emails a golpe de clic, sin conocimientos técnicos.",
      icon: landingIcon,
      link: "#"
    },
    {
      title: "Automatizaciones",
      description: "Ahorra tiempo con flujos automáticos inteligentes.",
      icon: automationIcon,
      link: "#"
    }
  ];

  return (
    <section className="ServicesSection">
      <h2 className="ServicesSection__title">
        Todo lo que necesitas para comunicarte con tu audiencia
      </h2>

      <p className="ServicesSection__subtitle">
        Campañas, listas, plantillas y automatizaciones en una sola plataforma de email marketing.
      </p>

      <div className="ServicesSection__grid">
        {services.map((service, index) => (
          <div key={index} className="ServicesSection__card">
            <img
              src={service.icon}
              alt={service.title}
              className="ServicesSection__icon"
            />
            <h3>{service.title}</h3>
            <p>{service.description}</p>

            {/* Enlace sin flecha */}
            <a href={service.link} className="ServicesSection__link">
              Saber más
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
