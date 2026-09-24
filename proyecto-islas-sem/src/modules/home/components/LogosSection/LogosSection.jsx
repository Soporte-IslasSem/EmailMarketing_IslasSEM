import "./LogosSection.styles.css";
import { clients } from "../../../../data/clients";

export default function LogosSection() {
  return (
    <section className="LogosSection">
      <h2 className="LogosSection__title">
        Empresas y organizaciones que confían en nosotros
      </h2>

      <div className="LogosSection__grid">
        {clients.map((client, index) => (
          <div key={index} className="LogosSection__item">
            <img
              src={client.logo}
              alt={client.name}
              className="LogosSection__logo"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
