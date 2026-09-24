import "./ModalBase.css";
import "./ProUpgradeModal.styles.css";

export default function ProUpgradeModal({ onClose }) {
  return (
    <div className="ModalOverlay">
      <div className="ModalBox ProUpgradeModal">

        <h2 className="ProUpgradeModal__title">
          Mejora tu tarifa a un plan superior
        </h2>

        <p className="ProUpgradeModal__text">
          Esta funcionalidad solo está disponible para las tarifas Pro o Enterprise.
          Además, también podrás disfrutar de las siguientes funcionalidades:
        </p>

        <ul className="ProUpgradeModal__list">
          <li>✔ Analizar y eliminar suscriptores que no existen o son de baja calidad</li>
          <li>✔ Optimización de suscriptores según su comportamiento</li>
          <li>✔ Enviar a la hora más activa de cada suscriptor</li>
          <li>✔ Soporte prioritario</li>
          <li>✔ Prioridad en la cola de envíos</li>
          <li>✔ Análisis de mejor franja horaria para enviar</li>
          <li>✔ Análisis de calidad y optimización de campañas</li>
          <li>✔ Reenvío automático de los email no abiertos</li>
        </ul>

        <div className="ModalButtons">
          <button className="cancel-btn" onClick={onClose}>
            No me interesa
          </button>

          <button className="upgrade-btn" onClick={onClose}>
            Ver tarifas Pro y Enterprise
          </button>
        </div>

      </div>
    </div>
  );
}
