import { useState } from "react";
import "./ImportZipModal.styles.css";

export default function ImportZipModal({ onClose, onImport }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");

  const isZipFile = (f) => f.name.toLowerCase().endsWith(".zip");

  const handleFileChange = async (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    if (!isZipFile(selected)) {
      setError("Solo se permiten archivos ZIP.");
      return;
    }

    setFile(selected);
    setError("");
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (!dropped) return;

    if (!isZipFile(dropped)) {
      setError("Solo se permiten archivos ZIP.");
      return;
    }

    setFile(dropped);
    setError("");
  };

  const handleImport = () => {
    if (!name.trim() || !file) {
      setError("Completa todos los campos.");
      return;
    }

    onImport({ name, file });
    onClose();
  };

  return (
    <div className="ImportZipModal">
      <div className="ImportZipModal__content">

        <h2>Importar archivo ZIP</h2>

        <label>Nombre de la plantilla</label>
        <input
          type="text"
          className="ImportZipModal__nameInput"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label>Archivo ZIP</label>
        <div
          className="ImportZipModal__dropzone"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <p>Arrastra o selecciona un archivo ZIP</p>
        </div>

        {/* ✅ Botón alternativo centrado */}
        <div className="ImportZipModal__fileButton">
          <input type="file" accept=".zip" onChange={handleFileChange} />
        </div>

        {file && <p className="fileName">{file.name}</p>}
        {error && <p className="error">{error}</p>}

        <div className="ImportZipModal__actions">
          <button onClick={handleImport}>Importar</button>
          <button className="cancel" onClick={onClose}>Cancelar</button>
        </div>

      </div>
    </div>
  );
}
