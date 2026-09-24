import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import "./CreateListModal.css";

export default function CreateListModal({ onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [senderEmail, setSenderEmail] = useState(user?.email || "");
  const [language, setLanguage] = useState("es");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const docRef = await addDoc(collection(db, "lists"), {
      name,
      senderEmail,
      language,
      userId: user.uid,
      subscribersCount: 0,
      createdAt: new Date(),
    });

    onClose();
    navigate(`/dashboard/lists/${docRef.id}`);
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
              onChange={(e) => setSenderEmail(e.target.value)}
              required
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

          <button className="CreateButton" type="submit">
            Crear
          </button>
        </form>
      </div>
    </div>
  );
}
