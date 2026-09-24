import "./StartHereSection.styles.css";

import sendIcon from "../../../../assets/icons/start-here/send.svg";
import messageIcon from "../../../../assets/icons/start-here/message.svg";
import layoutIcon from "../../../../assets/icons/start-here/layout-board-split.svg";
import settingsIcon from "../../../../assets/icons/start-here/settings.svg";

export default function StartHereSection() {
  const paths = [
    {
      title: "Enviar mi primera campaña",
      description: "Crea un email profesional y envíalo a tus suscriptores.",
      icon: sendIcon,
      link: "#"
    },
    {
      title: "Crear una lista de suscriptores",
      description: "Organiza tus contactos en listas y segmentos.",
      icon: messageIcon,
      link: "#"
    },
    {
      title: "Diseñar una plantilla",
      description: "Crea un email a golpe de clic con el editor visual.",
      icon: layoutIcon,
      link: "#"
    },
    {
      title: "Automatizar mi marketing",
      description: "Configura flujos automáticos que trabajen por ti.",
      icon: settingsIcon,
      link: "#"
    }
  ];

  return (
    <section className="StartHereSection">
      <h2 className="StartHereSection__title">¿Por dónde quieres empezar?</h2>

      <p className="StartHereSection__subtitle">
        Elige tu objetivo y te guiamos paso a paso.
      </p>

      <div className="StartHereSection__grid">
        {paths.map((path, index) => (
          <a key={index} href={path.link} className="StartHereSection__card">
            <img
              src={path.icon}
              alt={path.title}
              className="StartHereSection__icon"
            />
            <h3>{path.title}</h3>
            <p>{path.description}</p>
            <span className="StartHereSection__cta">Comenzar</span>
          </a>
        ))}
      </div>
    </section>
  );
}
