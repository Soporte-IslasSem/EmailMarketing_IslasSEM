import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import useTemplates from "../../hooks/useTemplates";
import SystemTemplates from "../SystemTemplates/SystemTemplates";
import TemplateActionsMenu from "./TemplateActionsMenu";
import RenameTemplateModal from "./modals/RenameTemplateModal";
import TagsModal from "./modals/TagsModal";
import ConfirmDeleteModal from "./modals/ConfirmDeleteModal";
import "./Templates.styles.css";

export default function Templates() {
  const {
    templates,
    deleteTemplate,
    duplicateTemplate,
    renameTemplate,
    updateThumbnail,
    assignTags,
    removeTags,
  } = useTemplates();

  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const openRenameModal = (template) => {
    setSelectedTemplate(template);
    setShowRenameModal(true);
  };

  const openTagsModal = (template) => {
    setSelectedTemplate(template);
    setShowTagsModal(true);
  };

  const openDeleteModal = (template) => {
    setSelectedTemplate(template);
    setShowDeleteModal(true);
  };

  return (
    <div className="Templates">

      {/* 🔵 Plantillas del sistema */}
      <SystemTemplates />

      {/* 🔵 Barra de pestañas */}
      <div className="Templates__tabs">
        <button
          className={`Templates__tab ${
            location.pathname === "/dashboard/templates" ? "active" : ""
          }`}
          onClick={() => navigate("/dashboard/templates")}
        >
          Mis plantillas
        </button>

        <button
          className={`Templates__tab ${
            location.pathname === "/dashboard/templates/tags" ? "active" : ""
          }`}
          onClick={() => navigate("/dashboard/templates/tags")}
        >
          Etiquetas
        </button>
      </div>

      {/* 🔵 Header */}
      <div className="Templates__header">
        <h1>Mis plantillas</h1>

        <Link to="/dashboard/templates/create" className="Templates__button">
          Crear plantilla
        </Link>
      </div>

      {/* 🔵 Grid de plantillas */}
      <div className="Templates__grid">
        {templates.map((t) => (
          <div key={t.id} className="Templates__item">

            {/* 🔥 Vista previa HTML o miniatura */}
            <div className="Templates__thumbnail">
              {t.html ? (
                <iframe
                  srcDoc={t.html}
                  title={t.name}
                  style={{
                    width: "100%",
                    height: "200px",
                    border: "none",
                    borderRadius: "8px",
                    backgroundColor: "#fff",
                  }}
                />
              ) : (
                <img
                  src={t.thumbnail || "/placeholder-template.png"}
                  alt={t.name}
                  style={{ width: "100%", borderRadius: "8px" }}
                />
              )}
            </div>

            <h3>{t.name}</h3>

            <div className="Templates__actionsWrapper">
              <TemplateActionsMenu
                onRename={() => openRenameModal(t)}
                onDuplicate={() => duplicateTemplate(t)}
                onDelete={() => openDeleteModal(t)}
                onUpdateThumbnail={() => updateThumbnail(t)}
                onAssignTags={() => openTagsModal(t)}
                onRemoveTags={() => removeTags(t)}
              />
            </div>

            <Link
              to={`/dashboard/templates/edit/${t.id}`}
              className="Templates__edit"
            >
              Editar
            </Link>
          </div>
        ))}

        {templates.length === 0 && (
          <p className="Templates__empty">No tienes plantillas creadas.</p>
        )}
      </div>

      {/* 🔵 Modales */}
      {showRenameModal && (
        <RenameTemplateModal
          template={selectedTemplate}
          onClose={() => setShowRenameModal(false)}
          onSave={(newName) => renameTemplate(selectedTemplate.id, newName)}
        />
      )}

      {showTagsModal && (
        <TagsModal
          template={selectedTemplate}
          onClose={() => setShowTagsModal(false)}
          onSave={(tags) => assignTags(selectedTemplate.id, tags)}
        />
      )}

      {showDeleteModal && (
        <ConfirmDeleteModal
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => {
            deleteTemplate(selectedTemplate.id);
            setShowDeleteModal(false);
          }}
        />
      )}
    </div>
  );
}
