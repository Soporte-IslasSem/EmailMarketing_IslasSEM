import "./TagCreateModal.styles.css";
import { useState } from "react";

export default function TagCreateModal({ onClose, onAdd }) {
  const [name, setName] = useState("");

  const handleAdd = () => {
    if (name.trim() === "") return;
    onAdd(name.trim());
  };

  return (
    <div className="TagCreateModal__overlay">
      <div className="TagCreateModal__content">
        {/* Botón de cierre */}
        <button className="TagCreateModal__close" onClick={onClose}>
          ✕
        </button>

        <h2>Añadir etiqueta</h2>

        <input
          type="text"
          placeholder="Nombre de la nueva etiqueta"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={128}
        />

        <div className="TagCreateModal__buttons">
          <button className="TagCreateModal__cancel" onClick={onClose}>
            Cancelar
          </button>
          <button className="TagCreateModal__add" onClick={handleAdd}>
            Añadir
          </button>
        </div>
      </div>
    </div>
  );
}