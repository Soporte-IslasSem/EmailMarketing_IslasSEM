// src/modules/lists/components/Lists/ListActionsMenu.jsx
import { createPortal } from "react-dom";
import "./Lists.styles.css";

export default function ListActionsMenu({ position, onView, onDelete, openUpward }) {
  if (!position) return null;

  const style = {
    position: "absolute",
    top: openUpward ? position.top - 80 : position.bottom + 4,
    left: position.left - 140,
    width: "180px",
    zIndex: 3000,
  };

  return createPortal(
    <div className={`ActionsMenu ${openUpward ? "open-upward" : ""}`} style={style}>
      <button onClick={onView}>Ver lista</button>
      <button className="DeleteAction" onClick={onDelete}>Eliminar</button>
    </div>,
    document.body
  );
}
