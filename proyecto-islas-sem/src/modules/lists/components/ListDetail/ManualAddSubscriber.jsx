import { useState, useEffect } from "react";
import "./ManualAddSubscriber.styles.css";

export default function ManualAddSubscriber({ onDataParsed }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const emailRegex =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const handleChange = (e) => {
    const value = e.target.value.trim().toLowerCase();
    setEmail(value);

    if (value.length === 0) {
      setError("");
      onDataParsed([]); // no enviar nada
      return;
    }

    if (!emailRegex.test(value)) {
      setError("El email no es válido");
      onDataParsed([]); // no enviar email inválido
      return;
    }

    setError("");
    onDataParsed([value]); // enviar email válido al padre
  };

  return (
    <div className="ManualAddSubscriber">
      <label>Email del suscriptor</label>

      <input
        type="text"
        placeholder="ejemplo@correo.com"
        value={email}
        onChange={handleChange}
      />

      {error && <p className="manual-error">{error}</p>}
    </div>
  );
}
