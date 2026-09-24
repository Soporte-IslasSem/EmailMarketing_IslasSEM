import { getFunctions, httpsCallable } from "firebase/functions";
import { auth } from "../../../../../config/firebaseConfig";
import { useState } from "react";
import "./GoogleSheetsModal.styles.css";

export default function GoogleSheetsModal({ onClose, onImport }) {
  const [sheetId, setSheetId] = useState("");
  const [range, setRange] = useState("A:A");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const connectAndImport = async () => {
    setLoading(true);
    setError("");

    try {
      /* global google */
      const client = google.accounts.oauth2.initTokenClient({
        client_id: "TU_CLIENT_ID.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        callback: async (response) => {
          const token = response.access_token;

          try {
            const functions = getFunctions(auth.app, "europe-west1");
            const importFn = httpsCallable(functions, "importFromGoogleSheets");

            const result = await importFn({
              token,
              sheetId,
              range,
            });

            const emails = result.data.emails;

            if (!emails || emails.length === 0) {
              setError("No se encontraron emails en la hoja.");
              setLoading(false);
              return;
            }

            onImport(emails);
            onClose();
          } catch (err) {
            console.error(err);
            setError("Error al conectar con Google Sheets.");
          }

          setLoading(false);
        },
      });

      client.requestAccessToken();
    } catch (err) {
      console.error(err);
      setError("Error al iniciar OAuth.");
      setLoading(false);
    }
  };

  return (
    <div className="GSModal__overlay">
      <div className="GSModal__box">

        <h2 className="GSModal__title">Importar desde Google Sheets</h2>

        <div className="GSModal__content">
          <label>ID de la hoja</label>
          <input
            type="text"
            placeholder="Ej: 1AbCdEfGhIjKlMnOpQrStUvWxYz"
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
          />

          <label>Rango (columna con emails)</label>
          <input
            type="text"
            placeholder="A:A"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          />

          {error && <p className="GSModal__error">{error}</p>}
        </div>

        <div className="GSModal__buttons">
          <button className="cancel" onClick={onClose}>Cancelar</button>

          <button
            className="confirm"
            onClick={connectAndImport}
            disabled={loading}
          >
            {loading ? "Importando..." : "Conectar e importar"}
          </button>
        </div>

      </div>
    </div>
  );
}
