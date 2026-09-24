import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import "./CoverManagerModal.styles.css";

export default function CoverManagerModal({ onClose, onImport }) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleImport = async () => {
    setLoading(true);
    setError("");

    try {
      const functions = getFunctions();
      const importFn = httpsCallable(functions, "importFromCoverManager");

      const result = await importFn({ apiKey });
      const emails = result.data.emails;

      if (!emails || emails.length === 0) {
        setError("No se encontraron clientes.");
        setLoading(false);
        return;
      }

      onImport(emails);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Error al conectar con CoverManager.");
    }

    setLoading(false);
  };

  return (
    <div className="CMModal__overlay">
      <div className="CMModal__box">

        <h2 className="CMModal__title">Importar desde CoverManager</h2>

        <div className="CMModal__content">
          <label>API Key</label>
          <input
            type="text"
            placeholder="Introduce tu API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />

          {error && <p className="CMModal__error">{error}</p>}
        </div>

        <div className="CMModal__buttons">
          <button className="cancel" onClick={onClose}>Cancelar</button>

          <button
            className="confirm"
            onClick={handleImport}
            disabled={loading}
          >
            {loading ? "Importando..." : "Importar"}
          </button>
        </div>

      </div>
    </div>
  );
}
