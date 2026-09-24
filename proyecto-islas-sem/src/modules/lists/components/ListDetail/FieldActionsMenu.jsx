import { useState, useRef, useEffect } from "react";
import "./FieldActionsMenu.styles.css";

export default function FieldActionsMenu({ onCopy, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef(null);

  const toggleMenu = () => setOpen(!open);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Detectar si debe abrir hacia arriba
  useEffect(() => {
    if (open && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 200);
    }
  }, [open]);

  return (
    <div className="FieldActionsMenu" ref={menuRef}>
      <button className="FieldActionsMenu__dots" onClick={toggleMenu}>
        ⋮
      </button>

      {open && (
        <ul
          className={`FieldActionsMenu__menu ${openUpward ? "open-upward" : ""}`}
          style={{
            top: openUpward ? "auto" : "28px",
            bottom: openUpward ? "28px" : "auto",
          }}
        >
          <li onClick={() => { setOpen(false); onCopy(); }}>
            Copiar comando
          </li>
          <li onClick={() => { setOpen(false); onEdit(); }}>
            Editar
          </li>
          <li onClick={() => { setOpen(false); onDelete(); }}>
            Eliminar
          </li>
        </ul>
      )}
    </div>
  );
}
