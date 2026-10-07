import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../../../config/firebaseConfig";
import { useParams } from "react-router-dom";
import { previewNotification } from "../../../../../utils/notificationHtml";
import "../ListNotificaciones.styles.css";

export default function ListNotificacionesConfirmEmail() {
  const { id: listId } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    enabled: false,
    subject: "",
    title: "",
    description: "",
    buttonText: "",
    footer: "",
  });

  useEffect(() => {
    const load = async () => {
      const ref = doc(db, "lists", listId, "notifications", "confirmEmail");
      const snap = await getDoc(ref);

      if (snap.exists()) setSettings(snap.data());
      setLoading(false);
    };

    load();
  }, [listId]);

  const updateField = (field, value) =>
    setSettings((prev) => ({ ...prev, [field]: value }));

  const save = async () => {
    setSaving(true);
    await setDoc(
      doc(db, "lists", listId, "notifications", "confirmEmail"),
      settings,
      { merge: true }
    );
    setSaving(false);
  };

  if (loading) return <p>Cargando ajustes...</p>;

  return (
    <div className="NotificacionesCard NotificacionesConfirmEmail">
      <h3>Email de confirmación</h3>

      <div className="NotificacionesRow">
        <label>Activar email de confirmación</label>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => updateField("enabled", e.target.checked)}
        />
      </div>

      <div className="NotificacionesField">
        <label>Asunto del email</label>
        <input
          type="text"
          value={settings.subject}
          onChange={(e) => updateField("subject", e.target.value)}
        />
      </div>

      <div className="NotificacionesField">
        <label>Título</label>
        <input
          type="text"
          value={settings.title}
          onChange={(e) => updateField("title", e.target.value)}
        />
      </div>

      <div className="NotificacionesField">
        <label>Descripción</label>
        <textarea
          rows="4"
          value={settings.description}
          onChange={(e) => updateField("description", e.target.value)}
        />
      </div>

      <div className="NotificacionesField">
        <label>Texto del botón</label>
        <input
          type="text"
          value={settings.buttonText}
          onChange={(e) => updateField("buttonText", e.target.value)}
        />
      </div>

      <div className="NotificacionesField">
        <label>Pie de página del email</label>
        <textarea
          rows="3"
          value={settings.footer}
          onChange={(e) => updateField("footer", e.target.value)}
        />
      </div>

      <div className="NotificacionesActions">
        <button className="NotificacionesPreview" onClick={() => previewNotification(listId, "confirmEmail", settings)}>Previsualizar</button>
        <button className="NotificacionesSave" onClick={save} disabled={saving}>
          {saving ? "Guardando..." : "Actualizar"}
        </button>
      </div>
    </div>
  );
}
