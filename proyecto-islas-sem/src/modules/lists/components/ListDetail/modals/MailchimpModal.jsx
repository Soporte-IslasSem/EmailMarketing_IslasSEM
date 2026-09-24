import { getFunctions, httpsCallable } from "firebase/functions";
import { useState } from "react";
import "./MailchimpModal.styles.css";

export default function MailchimpModal({ onClose, onImport }) {
  const [apiKey, setApiKey] = useState("");
  const [serverPrefix, setServerPrefix] = useState("");
  const [listId, setListId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleImport = async () => {
    setLoading(true);
    setError("");

    try {
      const functions = getFunctions();
      const importFn = httpsCallable(functions, "importFromMailchimp");

      const result = await importFn({
        apiKey,
        serverPrefix,
        listId,
      });

      const emails = result.data.emails;

      if (!emails || emails.length === 0) {
        setError("No se encontraron suscriptores en Mailchimp.");
        setLoading(false);
        return;
      }

      onImport(emails);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Error al importar desde Mailchimp.");
    }

    setLoading(false);
  };

  return (
    <div className="MCModal__overlay">
      <div className="MCModal__box">

        <h2 className="MCModal__title">Importar desde MailChimp</h2>

        <div className="MCModal__content">
          <label>API Key</label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Ej: 123abc-us21"
          />

          <label>Server Prefix</label>
          <input
            type="text"
            value={serverPrefix}
            onChange={(e) => setServerPrefix(e.target.value)}
            placeholder="Ej: us21"
          />

          <label>ID de la lista</label>
          <input
            type="text"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            placeholder="Ej: a1b2c3d4"
          />

          {error && <p className="MCModal__error">{error}</p>}
        </div>

        <div className="MCModal__buttons">
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
