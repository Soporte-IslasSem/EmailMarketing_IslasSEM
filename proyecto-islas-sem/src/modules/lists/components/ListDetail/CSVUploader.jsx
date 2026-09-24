import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import "./CSVUploader.styles.css";

export default function CSVUploader({ onDataParsed }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Opciones avanzadas
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [delimiter, setDelimiter] = useState(";");
  const [quoteChar, setQuoteChar] = useState('"');
  const [updateExisting, setUpdateExisting] = useState(false);

  const emailRegex =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const handleFile = (selected) => {
    if (!selected) return;

    if (
      !selected.name.endsWith(".csv") &&
      !selected.name.endsWith(".xlsx")
    ) {
      setError("El archivo debe ser CSV o Excel");
      return;
    }

    setError("");
    setFile(selected);

    if (selected.name.endsWith(".csv")) {
      parseCSV(selected);
    } else {
      parseExcel(selected);
    }
  };

  const parseCSV = (file) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      delimiter,
      quoteChar,
      complete: (results) => {
        const rawEmails = results.data.map((row) => row[0]);

        const cleaned = rawEmails
          .map((email) => email?.toString().trim().toLowerCase())
          .filter((email) => email);

        onDataParsed({
          emails: cleaned,
          updateExisting,
        });
      },
    });
  };

  const parseExcel = async (file) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const rawEmails = rows.map((row) => row[0]);

    const cleaned = rawEmails
      .map((email) => email?.toString().trim().toLowerCase())
      .filter((email) => email);

    onDataParsed({
      emails: cleaned,
      updateExisting,
    });
  };

  // DRAG & DROP
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    handleFile(droppedFile);
  };

  return (
    <div className="CSVUploader">

      <p className="csv-title">Arrastra o selecciona el archivo que quieres importar</p>

      <label
        className={`csv-dropzone ${isDragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".csv, .xlsx"
          onChange={(e) => handleFile(e.target.files[0])}
          style={{ display: "none" }}
        />

        {file ? (
          <p className="csv-file">{file.name}</p>
        ) : (
          <p>Haz clic aquí o arrastra tu archivo</p>
        )}
      </label>

      {error && <p className="csv-error">{error}</p>}

      {/* OPCIONES AVANZADAS */}
      <div className="csv-advanced">
        <button
          type="button"
          className="csv-advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
        </button>

        {showAdvanced && (
          <div className="csv-advanced-content">
            <div className="csv-advanced-row">
              <label>Separador del CSV</label>
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
              >
                <option value=";">;</option>
                <option value=",">,</option>
                <option value="|">|</option>
                <option value="\t">Tabulador</option>
              </select>
            </div>

            <div className="csv-advanced-row">
              <label>Carácter de agrupación</label>
              <input
                type="text"
                maxLength={1}
                value={quoteChar}
                onChange={(e) => setQuoteChar(e.target.value)}
              />
            </div>

            <div className="csv-advanced-row checkbox-row">
              <input
                type="checkbox"
                id="updateExisting"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
              />
              <label htmlFor="updateExisting">
                Actualizar suscriptores existentes
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
