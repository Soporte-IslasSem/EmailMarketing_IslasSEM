import "./ModalBase.css";

export default function ConfirmDeleteModal({ onClose, onConfirm }) {
  return (
    <div className="ModalBase">
      <div className="ModalBase__content confirmation">
        
        {/* Icono de papelera */}
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <span style={{ fontSize: "48px", color: "#d9534f" }}>🗑️</span>
        </div>

        <h2 className="ModalBase__title" style={{ textAlign: "center" }}>
          Confirmación
        </h2>

        <p style={{ textAlign: "center", marginTop: "8px" }}>
          ¿Seguro que quieres eliminar la plantilla?
        </p>

        <div className="ModalBase__actions" style={{ marginTop: "24px" }}>
          <button className="ModalBase__button--cancel" onClick={onClose}>
            Cancelar
          </button>

          <button
            className="ModalBase__button--primary"
            style={{ background: "#d9534f" }}
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
