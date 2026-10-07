import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import useTemplates from "../../hooks/useTemplates";
import SystemTemplates from "../SystemTemplates/SystemTemplates";
import TemplateActionsMenu from "./TemplateActionsMenu";
import TemplateThumb from "../TemplateThumb/TemplateThumb";
import TemplatesTabs from "./TemplatesTabs";
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

  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Sin pestaña elegida: si ya tienes plantillas se abren las tuyas; si no, la galería.
  const view = params.get("ver") || (templates.length ? "mis" : "sistema");

  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const allTags = useMemo(
    () => [...new Set(templates.flatMap((t) => t.tags || []).filter(Boolean))].sort(),
    [templates]
  );

  const mine = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter(
      (t) =>
        (!q || (t.name || "").toLowerCase().includes(q)) &&
        (!tag || (t.tags || []).includes(tag))
    );
  }, [templates, search, tag]);

  const openModal = (setter) => (template) => {
    setSelectedTemplate(template);
    setter(true);
  };

  return (
    <div className="Templates">
      <TemplatesTabs
        active={view}
        mineCount={templates.length}
        action={
          <Link to="/dashboard/templates?ver=sistema" className="Templates__button">
            Nueva plantilla
          </Link>
        }
      />

      {view === "sistema" && <SystemTemplates />}

      {view === "mis" && (
        <>
          <div className="Templates__toolbar">
            <div className="Templates__search">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input placeholder="Buscar en mis plantillas" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {allTags.length > 0 && (
              <select value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">Todas las etiquetas</option>
                {allTags.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <Link to="/dashboard/templates/create" className="Templates__ghost">Crear desde cero</Link>
          </div>

          <div className="Templates__grid">
            {mine.map((t) => (
              <div key={t.id} className="Templates__item">
                <div className="Templates__thumbnail" onClick={() => navigate(`/dashboard/templates/edit/${t.id}`)} title="Editar plantilla">
                  {t.html ? (
                    <TemplateThumb html={t.html} title={t.name} height={260} />
                  ) : (
                    <img src={t.thumbnail || "/placeholder-template.png"} alt={t.name} />
                  )}
                </div>

                <div className="Templates__info">
                  <h3>{t.name}</h3>
                  {(t.tags || []).length > 0 && (
                    <div className="Templates__tags">{t.tags.map((g) => <span key={g}>{g}</span>)}</div>
                  )}
                </div>

                <div className="Templates__foot">
                  <TemplateActionsMenu
                    onRename={() => openModal(setShowRenameModal)(t)}
                    onDuplicate={() => duplicateTemplate(t)}
                    onDelete={() => openModal(setShowDeleteModal)(t)}
                    onUpdateThumbnail={() => updateThumbnail(t)}
                    onAssignTags={() => openModal(setShowTagsModal)(t)}
                    onRemoveTags={() => removeTags(t)}
                  />
                  <Link to={`/dashboard/templates/edit/${t.id}`} className="Templates__edit">Editar</Link>
                </div>
              </div>
            ))}
          </div>

          {templates.length === 0 && (
            <div className="Templates__emptyState">
              <div className="Templates__emptyIcon">🎨</div>
              <h3>Aún no tienes plantillas</h3>
              <p>Elige uno de nuestros diseños y personalízalo con tu logo, tus textos y tus fotos.</p>
              <Link to="/dashboard/templates?ver=sistema" className="Templates__button">Ver diseños</Link>
            </div>
          )}
          {templates.length > 0 && mine.length === 0 && (
            <p className="Templates__empty">Ninguna plantilla coincide con la búsqueda.</p>
          )}
        </>
      )}

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
