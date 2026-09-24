import { useState, useEffect } from "react";
import "./TemplateTagsModal.styles.css";
import { db } from "../../../../../config/firebaseConfig";
import {
  collection,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

export default function TemplateTagsModal({ onClose, tag }) {
  const [tagName, setTagName] = useState("");
  const [error, setError] = useState("");

  // Si estamos editando, cargar el nombre actual
  useEffect(() => {
    if (tag) setTagName(tag.name);
  }, [tag]);

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
      const auth = getAuth();
      const user = auth.currentUser;
      const colRef = collection(db, "templateTags");
      const ownTagsQuery = query(colRef, where("userEmail", "==", user?.email || ""));
      const snapshot = await getDocs(ownTagsQuery);

      // Validar duplicados (excepto si es la misma etiqueta que estamos editando)
      const exists = snapshot.docs.find(
        (docItem) =>
          docItem.data().name.toLowerCase() === trimmed.toLowerCase() &&
          (!tag || docItem.id !== tag.id)
      );

      if (exists) {
        setError("Ya existe una etiqueta con ese nombre.");
        return;
      }

      if (tag) {
        // 🔹 Editar etiqueta existente
        await updateDoc(doc(db, "templateTags", tag.id), {
          name: trimmed,
        });
      } else {
        // 🔹 Crear nueva etiqueta asociada al usuario actual
        await addDoc(colRef, {
          name: trimmed,
          createdAt: serverTimestamp(),
          userEmail: user?.email || "unknown",
        });
      }

      onClose();
    } catch (err) {
      console.error("Error guardando etiqueta:", err);
      setError("Error al guardar la etiqueta.");
    }
  };

  return (
    <div className="TemplateTagsModal__overlay">
      <div className="TemplateTagsModal__content">
        <button className="TemplateTagsModal__close" onClick={onClose}>
          ✕
        </button>

        <h2>{tag ? "Editar etiqueta" : "Nueva etiqueta"}</h2>

        <input
          type="text"
          placeholder="Nombre de la etiqueta (máx. 128 caracteres)"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          maxLength={128}
        />

        {error && <p className="TemplateTagsModal__error">{error}</p>}

        <div className="TemplateTagsModal__actions">
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
