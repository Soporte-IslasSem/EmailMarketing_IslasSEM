import "./ModalBase.css";
import "./ProFeatureModal.styles.css";

export default function ProFeatureModal({ onClose }) {
  return (
    <div className="ModalOverlay">
      <div className="ModalBox ProModal">

        {/* ICONO DE ALERTA */}
        <div className="ProModal__icon">
          ⚠️
        </div>

        {/* TÍTULO */}
        <h2 className="ProModal__title">No puedes usar esta funcionalidad</h2>

        {/* TEXTO */}
        <p className="ProModal__text">
          Para poder usar esta funcionalidad y muchas otras, contrata una de nuestras tarifas de pago.
        </p>

        {/* BOTÓN */}
        <div className="ModalButtons">
         <button className="confirm-btn" onClick={() => {
            onClose();
            if (typeof window.openProUpgradeModal === "function") {
                window.openProUpgradeModal();
                    }
                }}>
                ¡Enséñame esas tarifas!
            </button>
        </div>

      </div>
    </div>
  );
}
