import { useState } from "react";
import "./ImportFromUrlModal.styles.css";

export default function ImportFromUrlModal({ onClose, onImport }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const handleImport = async () => {
    if (!name.trim() || !url.trim()) {
      setError("Completa todos los campos.");
      return;
    }

    try {
      const res = await fetch(url);
      const html = await res.text();

      if (!html.includes("<html")) {
        setError("La URL no contiene HTML válido.");
        return;
      }

      onImport({ name, html });
      onClose();
    } catch {
      setError("No se pudo obtener el HTML desde la URL.");
    }
  };

  return (
    <div className="ImportFromUrlModal">
      <div className="ImportFromUrlModal__content">

        <h2>Importar desde URL</h2>

        <label>Nombre de la plantilla</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />

        <label>URL del HTML</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} />

        {error && <p className="error">{error}</p>}

        <div className="ImportFromUrlModal__actions">
          <button onClick={handleImport}>Importar</button>
          <button className="cancel" onClick={onClose}>Cancelar</button>
        </div>

      </div>
    </div>
  );
}
