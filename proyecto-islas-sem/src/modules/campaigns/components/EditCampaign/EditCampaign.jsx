import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import useCampaigns from "../../hooks/useCampaigns";
import { db } from "../../../../config/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import "./EditCampaign.styles.css";

export default function EditCampaign() {
  const { id } = useParams();
  const { updateCampaign } = useCampaigns();

  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    const loadCampaign = async () => {
      const ref = doc(db, "campaigns", id);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        setSubject(data.subject);
        setContent(data.content);
      }
    };

    loadCampaign();
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    await updateCampaign(id, {
      subject,
      content
    });

    alert("Campaña actualizada");
  };

  return (
    <div className="EditCampaign">
      <h1>Editar campaña</h1>

      <form onSubmit={handleSubmit} className="EditCampaign__form">
        <input
          type="text"
          className="EditCampaign__input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <textarea
          className="EditCampaign__textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        <button className="EditCampaign__button">Guardar cambios</button>
      </form>
    </div>
  );
}
