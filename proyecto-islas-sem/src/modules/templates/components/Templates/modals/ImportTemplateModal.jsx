import { useState } from "react";
import "./ImportTemplateModal.styles.css";

export default function ImportTemplateModal({ onClose, onImport }) {
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");

  const handleImport = () => {
    if (!name.trim() || !html.trim()) {
      alert("Completa todos los campos antes de importar.");
      return;
    }

    // Validación básica del HTML
    if (!html.includes("<html")) {
      alert("El código no parece ser HTML válido.");
      return;
    }

    // Envía los datos al hook o backend
    onImport({ name, html });
    onClose();
  };

  return (
    <div className="ImportTemplateModal">
      <div className="ImportTemplateModal__content">
        <h2>Pegar HTML/Texto</h2>

        <label>Nombre de la plantilla</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ejemplo: Newsletter mayo"
        />

        <label>Código HTML de la plantilla</label>
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder="Pega aquí tu código HTML"
        />

        <div className="ImportTemplateModal__actions">
          <button onClick={handleImport}>Importar</button>
          <button onClick={onClose} className="cancel">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
