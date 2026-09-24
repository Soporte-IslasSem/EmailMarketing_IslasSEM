import { useState } from "react";
import "./ImportPasteHtmlModal.styles.css";

export default function ImportPasteHtmlModal({ onClose, onImport }) {
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  const handleImport = () => {
    if (!name.trim() || !html.trim()) {
      setError("Completa todos los campos.");
      return;
    }

    if (!html.includes("<html")) {
      setError("El contenido no parece ser HTML válido.");
      return;
    }

    onImport({ name, html });
    onClose();
  };

  return (
    <div className="ImportPasteHtmlModal">
      <div className="ImportPasteHtmlModal__content">

        <h2>Pegar HTML</h2>

        <label>Nombre de la plantilla</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ejemplo: Newsletter mayo"
        />

        <label>Código HTML</label>
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder="Pega aquí tu código HTML"
        />

        {error && <p className="error">{error}</p>}

        <div className="ImportPasteHtmlModal__actions">
          <button onClick={handleImport}>Importar</button>
          <button className="cancel" onClick={onClose}>Cancelar</button>
        </div>

      </div>
    </div>
  );
}
