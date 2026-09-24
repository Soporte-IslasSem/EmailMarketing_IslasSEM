import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useTemplates from "../../hooks/useTemplates";
import "./CreateTemplate.styles.css";

export default function CreateTemplate() {
  const { createTemplate } = useTemplates();
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim() || !html.trim()) {
      window.alert("Por favor, completa todos los campos antes de crear la plantilla.");
      return;
    }

    await createTemplate({ name, html });

    // 🔹 Limpieza de campos
    setName("");
    setHtml("");

    // 🔹 Redirección automática sin alert nativo
    navigate("/dashboard/templates");
  };

  return (
    <div className="CreateTemplate">
      <h1>Crear plantilla</h1>

      <form onSubmit={handleSubmit} className="CreateTemplate__form">
        <input
          type="text"
          placeholder="Nombre de la plantilla"
          className="CreateTemplate__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <textarea
          placeholder="Código HTML"
          className="CreateTemplate__textarea"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
        />

        <button type="submit" className="CreateTemplate__button">
          Crear
        </button>
      </form>
    </div>
  );
}
