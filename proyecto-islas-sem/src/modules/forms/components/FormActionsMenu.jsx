import { useState, useRef, useEffect } from "react";
import "./../styles/FormActionsMenu.styles.css";

export default function FormActionsMenu({ formId, onEdit, onDelete, onAssociate }) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef(null);

  const toggleMenu = () => setOpen(!open);

  // 🔹 Cierra el menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 🔹 Detecta si debe abrir hacia arriba
  useEffect(() => {
    if (open && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 200); // si hay poco espacio, abre hacia arriba
    }
  }, [open]);

  return (
    <div className="FormActionsMenu" ref={menuRef}>
      <button className="FormActionsMenu__dots" onClick={toggleMenu}>
        ⋮
      </button>

      {open && (
        <ul
          className={`FormActionsMenu__menu ${openUpward ? "open-upward" : ""}`}
          style={{
            top: openUpward ? "auto" : "28px",
            bottom: openUpward ? "28px" : "auto",
          }}
        >
          <li onClick={() => { setOpen(false); onEdit(formId); }}>
            Editar formulario
          </li>
          <li onClick={() => { setOpen(false); onDelete(formId); }}>
            Eliminar formulario
          </li>
          <li onClick={() => { setOpen(false); onAssociate(formId); }}>
            Obtener código para tu web
          </li>
        </ul>
      )}
    </div>
  );
}
