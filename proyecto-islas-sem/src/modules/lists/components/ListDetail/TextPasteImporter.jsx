import { useState, useEffect } from "react";
import "./TextPasteImporter.styles.css";

export default function TextPasteImporter({ onDataParsed }) {
  const [text, setText] = useState("");
  const [invalidEmails, setInvalidEmails] = useState([]);
  const [error, setError] = useState("");

  const MAX_LINES = 2000;

  const emailRegex =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const processText = (value) => {
    const rawLines = value.split("\n");

    const cleanedLines = rawLines
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0);

    if (cleanedLines.length > MAX_LINES) {
      setError(`Has superado el límite de ${MAX_LINES} emails.`);
    } else {
      setError("");
    }

    const invalid = cleanedLines.filter((email) => !emailRegex.test(email));
    setInvalidEmails(invalid);

    // 🔥 Enviar emails limpios al padre (ListDetail)
    onDataParsed(cleanedLines);
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);
    processText(value);
  };

  const lineCount = text
    .split("\n")
    .filter((l) => l.trim().length > 0).length;

  const isOverLimit = lineCount > MAX_LINES;

  return (
    <div className="TextPasteImporter">
      <textarea
        placeholder="Introduce los emails, uno por línea (máximo 2000)..."
        value={text}
        onChange={handleChange}
      />

      <div className="line-counter">
        {lineCount} / {MAX_LINES} emails
      </div>

      {error && <p className="textpaste-error">{error}</p>}

      {invalidEmails.length > 0 && (
        <div className="invalid-box">
          <p className="invalid-title">
            {invalidEmails.length} email(s) inválido(s) encontrado(s):
          </p>
          <ul className="invalid-list">
            {invalidEmails.slice(0, 10).map((email, i) => (
              <li key={i}>{email}</li>
            ))}
          </ul>

          {invalidEmails.length > 10 && (
            <p className="invalid-more">
              ...y {invalidEmails.length - 10} más
            </p>
          )}
        </div>
      )}
    </div>
  );
}
