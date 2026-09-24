import { useState } from "react";
import "./ModalBase.css";

export default function RenameTemplateModal({ template, onClose, onSave }) {
  const [name, setName] = useState(template.name);

  const handleSave = () => {
    onSave(name);   // Guarda el nuevo nombre
    onClose();      // Cierra el modal automáticamente
  };

  return (
    <div className="ModalBase">
      <div className="ModalBase__content rename">
        <h2 className="ModalBase__title" style={{ textAlign: "center" }}>
          Renombrar plantilla
        </h2>

        <input
          className="ModalBase__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nuevo nombre"
          style={{ marginTop: "14px" }}
        />

        <div className="ModalBase__actions" style={{ marginTop: "24px" }}>
          <button className="ModalBase__button--cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="ModalBase__button--primary"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
