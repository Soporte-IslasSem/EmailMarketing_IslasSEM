import { useState } from "react";
import { SENDER_EMAIL } from "../../../../config/sender";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { usePerms } from "../../../crm/lib/permissions";
import { useClientTypes } from "../../../crm/lib/clientTypes";
import { useOrg } from "../../../crm/lib/useOrg";
import { createTypeWithList } from "../../lib/crmLink";
import "./CreateListModal.css";

export default function CreateListModal({ onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const senderEmail = SENDER_EMAIL;
  const [language, setLanguage] = useState("es");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Un administrador crea a la vez el tipo de cliente del CRM (son lo mismo); el resto, una lista suelta.
  const { isAdmin, ready } = usePerms();
  const { types } = useClientTypes();
  const { orgId } = useOrg();
  const asType = ready && isAdmin;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let id;
      if (asType) {
        ({ listId: id } = await createTypeWithList(name, orgId, types));
      } else {
        id = (await addDoc(collection(db, "lists"), {
          name: name.trim(),
          senderEmail,
          language,
          userId: user.uid,
          subscribersCount: 0,
          createdAt: new Date(),
        })).id;
      }
      onClose();
      navigate(`/dashboard/lists/${id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="ModalOverlay">
      <div className="ModalBox">

        {/* HEADER DEL MODAL */}
        <div className="ModalHeader">
          <h2>Crear nueva lista</h2>

          {/* BOTÓN X PARA CERRAR */}
          <button className="ModalClose" onClick={onClose}>
            ✕
          </button>
        </div>

        <form className="ModalForm" onSubmit={handleSubmit}>
          <div className="ModalField">
            <label className="ModalLabel">Nombre de la lista</label>
            <input
              className="ModalInput"
              type="text"
              placeholder="Ej: Clientes potenciales"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="ModalField">
            <label className="ModalLabel">Email remitente por defecto</label>
            <input
              className="ModalInput"
              type="email"
              value={senderEmail}
              readOnly
              disabled
            />
          </div>

          <div className="ModalField">
            <label className="ModalLabel">Idioma de la lista</label>
            <select
              className="ModalSelect"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="fr">Francés</option>
            </select>
          </div>

          {asType && (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#136b68", background: "#eef6f5", borderRadius: 8, padding: "8px 10px" }}>
              También se crea el <b>tipo de cliente</b> con este nombre en el CRM: podrás clasificar a los contactos con él y aparecerán aquí solos.
            </p>
          )}
          {error && <p style={{ margin: "0 0 12px", fontSize: 13, color: "#b0304c" }}>{error}</p>}

          <button className="CreateButton" type="submit" disabled={busy}>
            {busy ? "Creando…" : "Crear"}
          </button>
        </form>
      </div>
    </div>
  );
}
