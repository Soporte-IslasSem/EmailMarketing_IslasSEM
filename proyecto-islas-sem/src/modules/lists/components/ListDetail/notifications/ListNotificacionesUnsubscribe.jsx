import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../../../config/firebaseConfig";
import { useParams } from "react-router-dom";
import { previewNotification } from "../../../../../utils/notificationHtml";
import "../ListNotificaciones.styles.css";

export default function ListNotificacionesUnsubscribe() {
  const { id: listId } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    title: "¿Seguro que quieres darte de baja?",
    description:
      "Esta acción no se puede deshacer. De forma opcional puedes seleccionar el motivo de la baja",
    buttonText: "Darme de baja",
    showReasons: true,
  });

  useEffect(() => {
    const load = async () => {
      const ref = doc(db, "lists", listId, "notifications", "unsubscribePage");
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
      doc(db, "lists", listId, "notifications", "unsubscribePage"),
      settings,
      { merge: true }
    );
    setSaving(false);
  };

  if (loading) return <p>Cargando ajustes...</p>;

  return (
    <div className="NotificacionesCard NotificacionesUnsubscribe">
      <h3>Página de baja</h3>

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

      <div className="NotificacionesRow">
        <label>Mostrar los motivos de la baja</label>
        <input
          type="checkbox"
          checked={settings.showReasons}
          onChange={(e) => updateField("showReasons", e.target.checked)}
        />
      </div>

      <div className="NotificacionesActions">
        <button className="NotificacionesPreview" onClick={() => previewNotification(listId, "unsubscribePage", settings)}>Previsualizar</button>
        <button className="NotificacionesSave" onClick={save} disabled={saving}>
          {saving ? "Guardando..." : "Actualizar"}
        </button>
      </div>
    </div>
  );
}
