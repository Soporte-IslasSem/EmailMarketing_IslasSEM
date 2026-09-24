import "./TagEditModal.styles.css";
import { useState } from "react";

export default function TagEditModal({ tag, onClose, onSave }) {
  const [name, setName] = useState(tag.name);

  const handleSave = () => {
    if (name.trim() === "") return;
    onSave(tag.id, name.trim());
  };

  return (
    <div className="TagEditModal__overlay">
      <div className="TagEditModal__content">
        <button className="TagEditModal__close" onClick={onClose}>
          ✕
        </button>

        <h2>Editar etiqueta</h2>

        <input
          type="text"
          placeholder="Nombre de la etiqueta"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={128}
        />

        <button className="TagEditModal__save" onClick={handleSave}>
          Guardar cambios
        </button>
      </div>
    </div>
  );
}
