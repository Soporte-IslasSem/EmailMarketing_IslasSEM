import CSVUploader from "./ListDetail/CSVUploader.jsx";
import TextPasteImporter from "./ListDetail/TextPasteImporter.jsx";
import ManualAddSubscriber from "./ListDetail/ManualAddSubscriber.jsx";

export default function ImportMethods({
  method,
  setMethod,
  setError,
  setRawEmails,
  setUpdateExisting,
  resetUploaderKey
}) {
  return (
    <div className="ListDetail__methods">

      <div
        className={`method-card ${method === "csv" ? "active" : ""}`}
        onClick={() => {
          setMethod("csv");
          setError("");
        }}
      >
        <input type="checkbox" checked={method === "csv"} readOnly />
        <div>
          <h3>Archivo CSV/Excel</h3>
          <p>Importa desde un archivo CSV o Excel.</p>
        </div>
      </div>

      <div
        className={`method-card ${method === "text" ? "active" : ""}`}
        onClick={() => {
          setMethod("text");
          setError("");
        }}
      >
        <input type="checkbox" checked={method === "text"} readOnly />
        <div>
          <h3>Pegar texto</h3>
          <p>Copia y pega tus suscriptores directamente.</p>
        </div>
      </div>

      <div
        className={`method-card ${method === "manual" ? "active" : ""}`}
        onClick={() => {
          setMethod("manual");
          setError("");
        }}
      >
        <input type="checkbox" checked={method === "manual"} readOnly />
        <div>
          <h3>Introducir manualmente</h3>
          <p>Añade suscriptores uno por uno.</p>
        </div>
      </div>

      {/* 🔵 CARD DINÁMICO — ahora dentro del grid */}
      {method === "csv" && (
        <div className="ListDetail__content">
          <CSVUploader
            key={resetUploaderKey}
            onDataParsed={({ emails, updateExisting }) => {
              setRawEmails(emails);
              setUpdateExisting(updateExisting);
            }}
          />
        </div>
      )}

      {method === "text" && (
        <div className="ListDetail__content">
          <TextPasteImporter
            onDataParsed={(emails) => {
              setRawEmails(emails);
              setError("");
            }}
          />
        </div>
      )}

      {method === "manual" && (
        <div className="ListDetail__content">
          <ManualAddSubscriber
            onDataParsed={(emails) => {
              setRawEmails(emails);
            }}
          />
        </div>
      )}

    </div>
  );
}
