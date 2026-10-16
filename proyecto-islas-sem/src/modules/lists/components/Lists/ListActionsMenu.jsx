// src/modules/lists/components/Lists/ListActionsMenu.jsx
import { createPortal } from "react-dom";
import "./Lists.styles.css";

export default function ListActionsMenu({ position, onView, onDelete, onConvert, openUpward }) {
  if (!position) return null;

  const style = {
    position: "absolute",
    top: openUpward ? position.top - (onConvert ? 120 : 80) : position.bottom + 4,
    left: position.left - (onConvert ? 200 : 140),
    width: onConvert ? "240px" : "180px",
    zIndex: 3000,
  };

  return createPortal(
    <div className={`ActionsMenu ${openUpward ? "open-upward" : ""}`} style={style}>
      <button onClick={onView}>Ver lista</button>
      {onConvert && <button onClick={onConvert}>Convertir en tipo de cliente</button>}
      <button className="DeleteAction" onClick={onDelete}>Eliminar</button>
    </div>,
    document.body
  );
}
