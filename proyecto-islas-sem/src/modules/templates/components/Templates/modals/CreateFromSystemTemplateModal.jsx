import { useState } from "react";
import "./ModalBase.css";

export default function CreateFromSystemTemplateModal({ template, onClose, onConfirm }) {
  // Se propone el nombre del diseño: basta con pulsar Continuar (o Enter).
  const [name, setName] = useState(template?.title || "");

  return (
    <div className="ModalBase">
      <div className="ModalBase__content ModalBase__content--islassem">
        {/* HEADER */}
        <div className="ModalBase__header">
          <h2 className="ModalBase__title">Seleccionar plantilla</h2>
          <button className="ModalBase__close" onClick={onClose}>×</button>
        </div>

        {/* DESCRIPCIÓN */}
        <p className="ModalBase__description">
          Asigna un nombre a tu nueva plantilla basada en <strong>{template.title}</strong>.
        </p>

        {/* INPUT */}
        <input
          className="ModalBase__input ModalBase__input--islassem"
          placeholder="Escribe el nombre de tu plantilla"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim()); }}
          autoFocus
          onFocus={(e) => e.target.select()}
        />

        {/* ACCIONES */}
        <div className="ModalBase__actions">
          <button className="ModalBase__button ModalBase__button--cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="ModalBase__button ModalBase__button--primary"
            onClick={() => onConfirm(name)}
            disabled={!name.trim()} // 🔹 deshabilita si está vacío
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
