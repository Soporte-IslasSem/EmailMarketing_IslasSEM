// src/modules/templates/components/SystemTemplates/SystemTemplates.jsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { systemTemplates } from "../../../../data/systemTemplates";
import useSystemTemplates from "../../hooks/useSystemTemplates";
import useTemplates from "../../hooks/useTemplates";
import CreateFromSystemTemplateModal from "../Templates/modals/CreateFromSystemTemplateModal";

// Importamos TODOS los modales nuevos
import ImportMenuModal from "../Templates/modals/ImportMenuModal";
import ImportFromUrlModal from "../Templates/modals/ImportFromUrlModal";
import ImportPasteHtmlModal from "../Templates/modals/ImportPasteHtmlModal";
import ImportHtmlModal from "../Templates/modals/ImportHtmlModal";
import ImportZipModal from "../Templates/modals/ImportZipModal";

import "./SystemTemplates.styles.css";

export default function SystemTemplates() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  // Control de modales de importación
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [importMethod, setImportMethod] = useState(null);

  const navigate = useNavigate();
  const { useTemplate } = useSystemTemplates();
  const { importTemplate } = useTemplates();

  // FILTRO DE PLANTILLAS DEL SISTEMA
  const filtered = systemTemplates.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleUse = (template) => {
    setSelected(template);
  };

  const handleConfirm = async (name) => {
    if (!selected) return;
    const newId = await useTemplate(selected, name);
    setSelected(null);
    if (newId) {
      navigate(`/dashboard/templates/edit/${newId}`);
    }
  };

  // Cuando un modal devuelve datos de importación, se guarda la plantilla de verdad
  const handleImportResult = async (data) => {
    const newId = await importTemplate(data);
    if (newId) {
      navigate(`/dashboard/templates/edit/${newId}`);
    }
  };

  return (
    <div className="SystemTemplates">
      <div className="SystemTemplates__header">
        <h2>Plantillas de ISLAS SEM</h2>

        <div className="SystemTemplates__controls">
          {/* 🔹 Campo de búsqueda */}
          <input
            type="text"
            placeholder="Buscar plantilla"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* 🔹 Botón que abre el menú de importación */}
          <button
            className="SystemTemplates__import"
            onClick={() => setShowImportMenu(true)}
          >
            Importar plantilla
          </button>
        </div>
      </div>

      {/* 🔹 Grid de plantillas */}
      <div className="SystemTemplates__grid">
        {filtered.map((t) => (
          <div key={t.id} className="SystemTemplates__item">
            <img src={t.image} alt={t.title} />
            <h3>{t.title}</h3>

            <button
              className="SystemTemplates__use"
              onClick={() => handleUse(t)}
            >
              Usar plantilla
            </button>
          </div>
        ))}
      </div>

      {/* Modal para usar plantillas del sistema */}
      {selected && (
        <CreateFromSystemTemplateModal
          template={selected}
          onClose={() => setSelected(null)}
          onConfirm={handleConfirm}
        />
      )}

      {/* Modal del menú principal */}
      {showImportMenu && (
        <ImportMenuModal
          onClose={() => setShowImportMenu(false)}
          onSelectOption={(method) => {
            setShowImportMenu(false);
            setImportMethod(method);
          }}
        />
      )}

      {/* Modal: Importar desde URL */}
      {importMethod === "url" && (
        <ImportFromUrlModal
          onClose={() => setImportMethod(null)}
          onImport={handleImportResult}
        />
      )}

      {/* Modal: Pegar HTML */}
      {importMethod === "paste" && (
        <ImportPasteHtmlModal
          onClose={() => setImportMethod(null)}
          onImport={handleImportResult}
        />
      )}

      {/* Modal: Subir archivo HTML */}
      {importMethod === "html" && (
        <ImportHtmlModal
          onClose={() => setImportMethod(null)}
          onImport={handleImportResult}
        />
      )}

      {/* Modal: Importar ZIP */}
      {importMethod === "zip" && (
        <ImportZipModal
          onClose={() => setImportMethod(null)}
          onImport={handleImportResult}
        />
      )}
    </div>
  );
}
