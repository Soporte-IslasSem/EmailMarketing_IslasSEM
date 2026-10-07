import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, doc, deleteDoc, getDocs, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";
import { useOrg } from "../../../crm/lib/useOrg";

// Cancela los correos de la campaña que aún están en cola (pendientes o programados),
// para que borrar o dar de baja una campaña detenga de verdad el envío.
async function cancelQueued(orgId, campaignId) {
  if (!orgId) return 0;
  const snap = await getDocs(query(collection(db, "outbox"), where("orgId", "==", orgId), where("campaignId", "==", campaignId)));
  const queued = snap.docs.filter((d) => ["pending", "scheduled"].includes(d.data().status));
  for (let i = 0; i < queued.length; i += 400) {
    const batch = writeBatch(db);
    queued.slice(i, i + 400).forEach((d) => batch.update(d.ref, { status: "cancelled", cancelledAt: Date.now() }));
    await batch.commit();
  }
  return queued.length;
}
import "./CampaignActionsMenu.styles.css";

export default function CampaignActionsMenu({ campaignId, status, reportId }) {
  const { orgId } = useOrg();
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
    const queuedMsg = ["sending", "scheduled"].includes(status) ? " Los correos que aún no se han enviado se cancelarán." : "";
    if (window.confirm(`¿Seguro que deseas eliminar esta campaña?${queuedMsg}`)) {
      try {
        const cancelled = await cancelQueued(orgId, campaignId);
        await deleteDoc(doc(db, "campaigns", campaignId));
        alert(`Campaña eliminada correctamente.${cancelled ? ` Se cancelaron ${cancelled} correo(s) pendientes.` : ""}`);
        setOpen(false);
      } catch (error) {
        console.error("Error al eliminar campaña:", error);
        alert("Error al eliminar la campaña.");
      }
    }
  };

  // 🟨 Función: dar de baja campaña
  const handleDeactivate = async () => {
    if (window.confirm("¿Dar de baja esta campaña? Los correos que aún no se han enviado se cancelarán.")) {
      try {
        const cancelled = await cancelQueued(orgId, campaignId);
        await updateDoc(doc(db, "campaigns", campaignId), {
          status: "inactive",
        });
        alert(`Campaña dada de baja.${cancelled ? ` Se cancelaron ${cancelled} correo(s) pendientes.` : ""}`);
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
          {(reportId || ["sent", "sending"].includes(status)) && (
            <li>
              {/* Los informes nuevos usan el id de la campaña (los genera el backend) */}
              <Link to={`/dashboard/reports/${reportId || campaignId}`}>Ver informe</Link>
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
