import { useState, useRef, useEffect } from "react";
import "./TemplateActionsMenu.styles.css";

export default function TemplateActionsMenu({
  onRename,
  onDuplicate,
  onDelete,
  onUpdateThumbnail,
  onAssignTags,
  onRemoveTags
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cierra el menú al elegir una opción.
  const act = (fn) => () => {
    setOpen(false);
    fn?.();
  };

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  return (
    <div className="TemplateActionsMenu" ref={menuRef}>
      <button
        className="TemplateActionsMenu__trigger"
        onClick={handleToggle}
      >
        ⋯
      </button>

      {open && (
        <div className="TemplateActionsMenu__dropdown TemplateActionsMenu__dropdown--top-right">
          <button onClick={act(onUpdateThumbnail)}>Actualizar miniatura</button>
          <button onClick={act(onDuplicate)}>Duplicar plantilla</button>
          <button onClick={act(onRename)}>Renombrar plantilla</button>
          <button onClick={act(onDelete)} className="danger">Eliminar plantilla</button>
          <hr />
          <button onClick={act(onAssignTags)}>Asignar etiquetas</button>
          <button onClick={act(onRemoveTags)}>Eliminar etiquetas</button>
        </div>
      )}
    </div>
  );
}
