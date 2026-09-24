import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";
import "./CampaignActionsMenu.styles.css";

export default function CampaignActionsMenu({ campaignId, status, reportId }) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 🔧 Detectar si el menú está cerca del borde inferior
  useEffect(() => {
    if (open && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      setOpenUpward(rect.bottom > windowHeight - 100);
    }
  }, [open]);

  // 🟦 Función: eliminar campaña
  const handleDelete = async () => {
    if (window.confirm("¿Seguro que deseas eliminar esta campaña?")) {
      try {
        await deleteDoc(doc(db, "campaigns", campaignId));
        alert("Campaña eliminada correctamente.");
        setOpen(false);
      } catch (error) {
        console.error("Error al eliminar campaña:", error);
        alert("Error al eliminar la campaña.");
      }
    }
  };

  // 🟨 Función: dar de baja campaña
  const handleDeactivate = async () => {
    if (window.confirm("¿Dar de baja esta campaña?")) {
      try {
        await updateDoc(doc(db, "campaigns", campaignId), {
          status: "inactive",
        });
        alert("Campaña dada de baja.");
        setOpen(false);
      } catch (error) {
        console.error("Error al dar de baja:", error);
        alert("Error al actualizar la campaña.");
      }
    }
  };

  // 🟩 Función: reactivar campaña
  const handleActivate = async () => {
    try {
      await updateDoc(doc(db, "campaigns", campaignId), {
        status: "draft",
      });
      alert("Campaña activada de nuevo.");
      setOpen(false);
    } catch (error) {
      console.error("Error al activar:", error);
      alert("Error al actualizar la campaña.");
    }
  };

  // 🟧 Función: editar campaña
  const handleEdit = () => {
    navigate(`/dashboard/campaigns/edit/${campaignId}`);
  };

  return (
    <div className="CampaignActionsMenu" ref={menuRef}>
      <button className="dots" onClick={() => setOpen(!open)}>⋯</button>

      {open && (
        <ul className={`menu ${openUpward ? "open-upward" : ""}`}>
          {reportId && (
            <li>
              <Link to={`/dashboard/reports/${reportId}`}>Ver informe</Link>
            </li>
          )}
          <li onClick={handleEdit}>Editar campaña</li>
          {status === "inactive" ? (
            <li onClick={handleActivate}>Activar</li>
          ) : (
            <li onClick={handleDeactivate}>Dar de baja</li>
          )}
          <li onClick={handleDelete}>Eliminar</li>
        </ul>
      )}
    </div>
  );
}
