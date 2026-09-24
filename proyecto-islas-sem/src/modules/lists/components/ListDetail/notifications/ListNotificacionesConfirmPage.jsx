import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../../../config/firebaseConfig";
import { useParams } from "react-router-dom";
import "../ListNotificaciones.styles.css";

export default function ListNotificacionesConfirmPage() {
  const { id: listId } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    mode: "custom",
    link: "",
    title: "¡Gracias por suscribirte!",
    description:
      "Te has suscrito correctamente a la lista de correo. Podrás cancelar tu suscripción cuando lo desees.",
    buttonText: "",
  });

  useEffect(() => {
    const load = async () => {
      const ref = doc(db, "lists", listId, "notifications", "confirmPage");
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
      doc(db, "lists", listId, "notifications", "confirmPage"),
      settings,
      { merge: true }
    );
    setSaving(false);
  };

  if (loading) return <p>Cargando ajustes...</p>;

  return (
    <div className="NotificacionesCard NotificacionesConfirmPage">
      <h3>Página de confirmación</h3>

      <div className="NotificacionesRow">
        <label>Selecciona cómo quieres que sea la confirmación:</label>
      </div>

      <div className="NotificacionesModes">
        <label>
          <input
            type="radio"
            name="mode"
            value="link"
            checked={settings.mode === "link"}
            onChange={() => updateField("mode", "link")}
          />
          Enlace
        </label>

        <label>
          <input
            type="radio"
            name="mode"
            value="custom"
            checked={settings.mode === "custom"}
            onChange={() => updateField("mode", "custom")}
          />
          Campos personalizables
        </label>
      </div>

      {settings.mode === "link" && (
        <div className="NotificacionesField">
          <label>Enlace de redirección</label>
          <input
            type="text"
            value={settings.link}
            onChange={(e) => updateField("link", e.target.value)}
          />
        </div>
      )}

      {settings.mode === "custom" && (
        <>
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
        </>
      )}

      <div className="NotificacionesActions">
        <button className="NotificacionesPreview">Previsualizar</button>
        <button className="NotificacionesSave" onClick={save} disabled={saving}>
          {saving ? "Guardando..." : "Actualizar"}
        </button>
      </div>
    </div>
  );
}
