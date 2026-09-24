import "./CreateCampaign.styles.css";
import { useNavigate } from "react-router-dom";

export default function CreateCampaign() {
  const navigate = useNavigate();

  const handleSelect = (type) => {
    navigate(`/dashboard/campaigns/create/config?type=${type}`);
  };

  return (
    <div className="CreateCampaign">
      <h1 className="CreateCampaign__title">Crear campaña</h1>
      <p className="CreateCampaign__subtitle">
        Selecciona el tipo de campaña que deseas crear.
      </p>

      <div className="CreateCampaign__grid">
        {/* NEWSLETTER */}
        <div
          className="CreateCampaign__card"
          onClick={() => handleSelect("newsletter")}
        >
          <img src="/assets/campaigns/newsletter.png" alt="Newsletter" />
          <h3>Newsletter</h3>
          <p>Envía campañas de email estándar a tus listas.</p>
        </div>

        {/* AUTORESPONDER */}
        <div
          className="CreateCampaign__card"
          onClick={() => handleSelect("autoresponder")}
        >
          <img src="/assets/campaigns/autoresponder.png" alt="Autoresponder" />
          <h3>Autoresponder</h3>
          <p>Envía emails automáticos basados en eventos.</p>
        </div>

        {/* RSS */}
        <div
          className="CreateCampaign__card"
          onClick={() => handleSelect("rss")}
        >
          <img src="/assets/campaigns/rss.png" alt="RSS" />
          <h3>RSS</h3>
          <p>Envía campañas automáticas basadas en tu feed RSS.</p>
        </div>

        {/* TEST A/B */}
        <div
          className="CreateCampaign__card"
          onClick={() => handleSelect("testab")}
        >
          <img src="/assets/campaigns/test-ab.png" alt="Test A/B" />
          <h3>Test A/B</h3>
          <p>Prueba diferentes versiones de tu campaña.</p>
        </div>
      </div>
    </div>
  );
}
