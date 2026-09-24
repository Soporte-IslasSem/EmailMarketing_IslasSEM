import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import "./../styles/StepConfig.styles.css";

export default function StepConfig({ formId, onNext, onBack }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [successMessage, setSuccessMessage] = useState("¡Gracias por suscribirte!");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [doubleOptIn, setDoubleOptIn] = useState(false);

  const [error, setError] = useState(null);

  useEffect(() => {
    const loadForm = async () => {
      try {
        setLoading(true);
        const ref = doc(db, "forms", formId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("No se encontró el formulario.");
          setLoading(false);
          return;
        }

        const data = snap.data();

        setName(data.name || "");
        setSuccessMessage(data.successMessage || "¡Gracias por suscribirte!");
        setRedirectUrl(data.redirectUrl || "");
        setDoubleOptIn(data.doubleOptIn || false);

        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Error al cargar la configuración.");
        setLoading(false);
      }
    };

    if (formId) loadForm();
  }, [formId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const ref = doc(db, "forms", formId);

      await updateDoc(ref, {
        name,
        successMessage,
        redirectUrl,
        doubleOptIn,
        step: 4,
        updatedAt: serverTimestamp(),
      });

      if (onNext) onNext();
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Cargando configuración...</p>;
  if (error) return <p className="StepConfig__error">{error}</p>;

  return (
    <div className="StepConfig__container">
      <h3 className="StepConfig__title">Configura tu formulario</h3>
      <p className="StepConfig__subtitle">
        Define el nombre interno, el mensaje de éxito y la redirección opcional.
      </p>

      <div className="StepConfig__form">

        <div className="StepConfig__field">
          <label>Nombre del formulario</label>
          <input
            type="text"
            placeholder="Ej: Formulario Newsletter"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="StepConfig__field">
          <label>Mensaje de éxito</label>
          <textarea
            rows={3}
            value={successMessage}
            onChange={(e) => setSuccessMessage(e.target.value)}
          />
        </div>

        <div className="StepConfig__field">
          <label>Redirigir tras enviar (opcional)</label>
          <input
            type="text"
            placeholder="https://tusitio.com/gracias"
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
          />
        </div>

        <div className="StepConfig__checkbox">
          <input
            type="checkbox"
            checked={doubleOptIn}
            onChange={(e) => setDoubleOptIn(e.target.checked)}
          />
          <label>Requerir confirmación por email (double opt-in)</label>
        </div>
      </div>

      {error && <p className="StepConfig__error">{error}</p>}

      <div className="StepConfig__actions">
        {onBack && (
          <button
            type="button"
            className="StepConfig__backButton"
            onClick={onBack}
            disabled={saving}
          >
            Volver a plantillas
          </button>
        )}

        <button
          type="button"
          className="StepConfig__nextButton"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Siguiente: Diseño"}
        </button>
      </div>
    </div>
  );
}
