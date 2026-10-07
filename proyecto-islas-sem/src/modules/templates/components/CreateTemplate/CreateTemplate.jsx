import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useTemplates from "../../hooks/useTemplates";
import { BLANK_TEMPLATE } from "../TemplateEditor/editorBlocks";
import "./CreateTemplate.styles.css";

export default function CreateTemplate() {
  const { createTemplate } = useTemplates();
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Solo el nombre es obligatorio: sin HTML se abre el editor con una plantilla en blanco.
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Ponle un nombre a la plantilla.");
      return;
    }

    const newId = await createTemplate({ name: name.trim(), html: html.trim() || BLANK_TEMPLATE });
    if (newId) navigate(`/dashboard/templates/edit/${newId}`);
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
          onChange={(e) => { setName(e.target.value); setError(""); }}
        />
        {error && <p style={{ color: "#c92a2a", margin: 0, fontSize: 13 }}>{error}</p>}

        <textarea
          placeholder="Código HTML (opcional). Déjalo vacío para empezar con una plantilla en blanco en el editor."
          className="CreateTemplate__textarea"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
        />

        <button type="submit" className="CreateTemplate__button">
          Crear y abrir el editor
        </button>
      </form>
    </div>
  );
}
