import "./ClientsSection.styles.css";
import { clients } from "../../../../data/clients";

export default function ClientsSection() {
  return (
    <section className="ClientsSection">
      <div className="ClientsSection__container">
        <h2 className="ClientsSection__title">
          Organizaciones que han colaborado con nosotros
        </h2>

        <div className="ClientsSection__grid">
          {clients.map((client, index) => (
            <div key={index} className="ClientsSection__item">
              <img
                src={client.logo}
                alt={client.name}
                className="client-logo"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
