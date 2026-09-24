import { useState } from "react";
import ProFeatureModal from "./modals/ProFeatureModal";
import "./ListHerramientas.styles.css";

export default function ListHerramientas() {
  const [showProModal, setShowProModal] = useState(false);

  return (
    <div className="ListHerramientas">
      <h2>Herramientas</h2>
      <p>Aquí podrás acceder a herramientas adicionales de la lista.</p>

      <div className="tools-list">

        {/* WEBHOOKS */}
        <div className="tool-item">
          <div>
            <h3>Webhooks</h3>
            <span className="tool-status">Desactivado</span>
          </div>
          <button className="tool-btn" onClick={() => setShowProModal(true)}>
            Configurar
          </button>
        </div>

        {/* OPTIMIZAR LISTA */}
        <div className="tool-item">
          <div>
            <h3>Optimizar lista</h3>
            <span className="tool-pro">PRO</span>
          </div>
          <button className="tool-btn" onClick={() => setShowProModal(true)}>
            Optimizar
          </button>
        </div>

        {/* DEPURAR EMAILS */}
        <div className="tool-item">
          <div>
            <h3>Depurar emails de la lista</h3>
            <span className="tool-pro">PRO</span>
          </div>
          <button className="tool-btn" onClick={() => setShowProModal(true)}>
            Depurar
          </button>
        </div>

      </div>

      {/* MODAL PRO */}
      {showProModal && (
        <ProFeatureModal onClose={() => setShowProModal(false)} />
      )}
    </div>
  );
}
