import { useState } from "react";
import "./ImportHtmlModal.styles.css";

export default function ImportHtmlModal({ onClose, onImport }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");

  const handleFileChange = async (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    if (selected.type !== "text/html") {
      setError("Solo se permiten archivos HTML.");
      return;
    }

    const text = await selected.text();
    setFile({ name: selected.name, content: text });
    setError("");
  };

  const handleImport = () => {
    if (!name.trim() || !file) {
      setError("Completa todos los campos.");
      return;
    }

    if (!file.content.includes("<html")) {
      setError("El archivo no contiene HTML válido.");
      return;
    }

    onImport({ name, html: file.content });
    onClose();
  };

  return (
    <div className="ImportHtmlModal">
      <div className="ImportHtmlModal__content">

        <h2>Subir archivo HTML</h2>

        <label>Nombre de la plantilla</label>
        <input
          type="text"
          className="ImportHtmlModal__nameInput"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label>Archivo HTML</label>
        <input type="file" accept=".html" onChange={handleFileChange} />

        {file && <p className="fileName">{file.name}</p>}
        {error && <p className="error">{error}</p>}

        <div className="ImportHtmlModal__actions">
          <button onClick={handleImport}>Importar</button>
          <button className="cancel" onClick={onClose}>Cancelar</button>
        </div>

      </div>
    </div>
  );
}
