import { useState } from "react";
import ProFeatureModal from "./modals/ProFeatureModal";
import "./ListAudiencias.styles.css";

export default function ListAudiencias() {
  const [showProModal, setShowProModal] = useState(false);

  return (
    <div className="ListAudiencias">
      <h2>Audiencias</h2>
      <p>Aquí podrás gestionar sincronizaciones y audiencias externas.</p>

      <div className="audiencias-card">
        <div>
          <h3>Sincronizar audiencias externas</h3>
          <span className="audiencias-pro">PRO</span>
        </div>

        <button
          className="audiencias-btn"
          onClick={() => setShowProModal(true)}
        >
          Configurar
        </button>
      </div>

      {showProModal && (
        <ProFeatureModal onClose={() => setShowProModal(false)} />
      )}
    </div>
  );
}
