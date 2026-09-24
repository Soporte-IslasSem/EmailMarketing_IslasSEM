import { useState } from "react";
import "./TagsModal.styles.css";
import { db } from "../../../../../config/firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function TagsModal({ onClose }) {
  const [tagName, setTagName] = useState("");
  const [error, setError] = useState("");

  const handleSave = async () => {
    const trimmed = tagName.trim();

    if (!trimmed) {
      setError("El nombre no puede estar vacío.");
      return;
    }

    if (trimmed.length > 128) {
      setError("Máximo 128 caracteres.");
      return;
    }

    try {
      await addDoc(collection(db, "tags"), {
        name: trimmed,
        createdAt: serverTimestamp(),
      });

      onClose();
    } catch (err) {
      console.error("Error guardando etiqueta:", err);
      setError("Error al guardar la etiqueta.");
    }
  };

  return (
    <div className="TagsModal__overlay">
      <div className="TagsModal__content">
        <button className="TagsModal__close" onClick={onClose}>
          ✕
        </button>

        <h2>Añadir etiqueta</h2>

        <input
          type="text"
          placeholder="Nombre de la nueva etiqueta (máx. 128 caracteres)"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          maxLength={128}
        />

        {error && <p className="TagsModal__error">{error}</p>}

        <div className="TagsModal__actions">
          <button className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" onClick={handleSave}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
