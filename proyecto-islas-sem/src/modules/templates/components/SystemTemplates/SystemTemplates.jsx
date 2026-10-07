// src/modules/templates/components/SystemTemplates/SystemTemplates.jsx

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { systemTemplates, TEMPLATE_CATEGORIES } from "../../../../data/systemTemplates";
import useSystemTemplates from "../../hooks/useSystemTemplates";
import useTemplates from "../../hooks/useTemplates";
import CreateFromSystemTemplateModal from "../Templates/modals/CreateFromSystemTemplateModal";
import TemplateThumb from "../TemplateThumb/TemplateThumb";

import ImportMenuModal from "../Templates/modals/ImportMenuModal";
import ImportFromUrlModal from "../Templates/modals/ImportFromUrlModal";
import ImportPasteHtmlModal from "../Templates/modals/ImportPasteHtmlModal";
import ImportHtmlModal from "../Templates/modals/ImportHtmlModal";
import ImportZipModal from "../Templates/modals/ImportZipModal";

import "./SystemTemplates.styles.css";

const PAGE_SIZES = [15, 25, 50, 100];

export default function SystemTemplates() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewDevice, setPreviewDevice] = useState("desktop");

  const [showImportMenu, setShowImportMenu] = useState(false);
  const [importMethod, setImportMethod] = useState(null);

  const navigate = useNavigate();
  const { useTemplate } = useSystemTemplates();
  const { importTemplate } = useTemplates();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return systemTemplates.filter(
      (t) =>
        (!category || t.tags.includes(category)) &&
        (!q || t.title.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q)))
    );
  }, [search, category]);

  const counts = useMemo(() => {
    const c = {};
    systemTemplates.forEach((t) => t.tags.forEach((g) => (c[g] = (c[g] || 0) + 1)));
    return c;
  }, []);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const handleConfirm = async (name) => {
    if (!selected) return;
    const newId = await useTemplate(selected, name);
    setSelected(null);
    setPreview(null);
    if (newId) navigate(`/dashboard/templates/edit/${newId}`);
  };

  // Cuando un modal devuelve datos de importación, se guarda la plantilla de verdad
  const handleImportResult = async (data) => {
    const newId = await importTemplate(data);
    if (newId) navigate(`/dashboard/templates/edit/${newId}`);
  };

  return (
    <div className="SystemTemplates">
      <div className="SystemTemplates__controls">
        <div className="SystemTemplates__search">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input
            type="text"
            placeholder="Buscar plantilla"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && <button onClick={() => { setSearch(""); setPage(1); }} aria-label="Limpiar">×</button>}
        </div>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">Todas las etiquetas</option>
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c} ({counts[c] || 0})</option>
          ))}
        </select>
        <button className="SystemTemplates__import" onClick={() => setShowImportMenu(true)}>
          Importar plantilla
        </button>
      </div>

      <div className="SystemTemplates__grid">
        {visible.map((t) => (
          <div key={t.id} className="SystemTemplates__item">
            <TemplateThumb html={t.html} title={t.title} height={300} onClick={() => { setPreview(t); setPreviewDevice("desktop"); }} />
            <div className="SystemTemplates__info">
              <h3>{t.title}</h3>
              <div className="SystemTemplates__tags">
                {t.tags.map((g) => <span key={g}>{g}</span>)}
              </div>
            </div>
            <button className="SystemTemplates__use" onClick={() => setSelected(t)}>
              Usar plantilla
            </button>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="SystemTemplates__empty">No hay plantillas que coincidan con la búsqueda.</p>
        )}
      </div>

      <div className="SystemTemplates__pager">
        <span>
          Mostrando
          <select value={pageSize} onChange={(e) => { setPageSize(+e.target.value); setPage(1); }}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          de {filtered.length} plantillas
        </span>
        {pages > 1 && (
          <div className="SystemTemplates__pages">
            <button disabled={current === 1} onClick={() => setPage(current - 1)}>‹</button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button key={n} className={n === current ? "is-on" : ""} onClick={() => setPage(n)}>{n}</button>
            ))}
            <button disabled={current === pages} onClick={() => setPage(current + 1)}>›</button>
          </div>
        )}
      </div>

      {/* Vista previa */}
      {preview && (
        <div className="SystemTemplates__modal" onClick={() => setPreview(null)}>
          <div className="SystemTemplates__modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="SystemTemplates__modal-head">
              <strong>{preview.title}</strong>
              <div className="SystemTemplates__devices">
                <button className={previewDevice === "desktop" ? "is-on" : ""} onClick={() => setPreviewDevice("desktop")}>Escritorio</button>
                <button className={previewDevice === "mobile" ? "is-on" : ""} onClick={() => setPreviewDevice("mobile")}>Móvil</button>
              </div>
              <div className="SystemTemplates__modal-actions">
                <button className="SystemTemplates__use" onClick={() => setSelected(preview)}>Usar plantilla</button>
                <button className="SystemTemplates__close" onClick={() => setPreview(null)} aria-label="Cerrar">×</button>
              </div>
            </div>
            <div className="SystemTemplates__modal-body">
              <iframe
                title={preview.title}
                className={`SystemTemplates__preview SystemTemplates__preview--${previewDevice}`}
                srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${preview.html}</body></html>`}
              />
            </div>
          </div>
        </div>
      )}

      {selected && (
        <CreateFromSystemTemplateModal
          template={selected}
          onClose={() => setSelected(null)}
          onConfirm={handleConfirm}
        />
      )}

      {showImportMenu && (
        <ImportMenuModal
          onClose={() => setShowImportMenu(false)}
          onSelectOption={(method) => {
            setShowImportMenu(false);
            setImportMethod(method);
          }}
        />
      )}
      {importMethod === "url" && <ImportFromUrlModal onClose={() => setImportMethod(null)} onImport={handleImportResult} />}
      {importMethod === "paste" && <ImportPasteHtmlModal onClose={() => setImportMethod(null)} onImport={handleImportResult} />}
      {importMethod === "html" && <ImportHtmlModal onClose={() => setImportMethod(null)} onImport={handleImportResult} />}
      {importMethod === "zip" && <ImportZipModal onClose={() => setImportMethod(null)} onImport={handleImportResult} />}
    </div>
  );
}
