import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../../../config/firebaseConfig";
import { useParams } from "react-router-dom";
import "../ListNotificaciones.styles.css";

export default function ListNotificacionesGeneral() {
  const { id: listId } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    notifyOnSubscribe: false,
    notifyOnUnsubscribe: false,
    logoUrl: "",
    contentColor: "#DBDBDB",
    backgroundColor: "#FFFFFF",
    buttonColor: "#412CE1",
  });

  useEffect(() => {
    const load = async () => {
      const ref = doc(db, "lists", listId, "notifications", "general");
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
      doc(db, "lists", listId, "notifications", "general"),
      settings,
      { merge: true }
    );
    setSaving(false);
  };

  if (loading) return <p>Cargando ajustes...</p>;

  return (
    <div className="NotificacionesCard NotificacionesGeneral">
      <h3>Ajustes generales</h3>

      <div className="NotificacionesRow">
        <label>Activar notificaciones alta/baja</label>
        <input
          type="checkbox"
          checked={settings.notifyOnSubscribe}
          onChange={(e) => updateField("notifyOnSubscribe", e.target.checked)}
        />
      </div>

      <div className="NotificacionesField">
        <label>Logotipo personalizado (URL)</label>
        <input
          type="text"
          value={settings.logoUrl}
          onChange={(e) => updateField("logoUrl", e.target.value)}
        />
      </div>

      <div className="NotificacionesField">
        <label>Color del contenido</label>
        <input
          type="color"
          value={settings.contentColor}
          onChange={(e) => updateField("contentColor", e.target.value)}
        />
      </div>

      <div className="NotificacionesField">
        <label>Color de fondo</label>
        <input
          type="color"
          value={settings.backgroundColor}
          onChange={(e) => updateField("backgroundColor", e.target.value)}
        />
      </div>

      <div className="NotificacionesField">
        <label>Color de los botones</label>
        <input
          type="color"
          value={settings.buttonColor}
          onChange={(e) => updateField("buttonColor", e.target.value)}
        />
      </div>

      <div className="NotificacionesActions">
        <button className="NotificacionesSave" onClick={save} disabled={saving}>
          {saving ? "Guardando..." : "Actualizar"}
        </button>
      </div>
    </div>
  );
}
