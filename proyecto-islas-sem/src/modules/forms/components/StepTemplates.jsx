import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import "./../styles/StepTemplates.styles.css";

const TEMPLATES = [
  {
    id: "simple",
    name: "Formulario simple",
    description: "Un formulario limpio con campo de email y botón.",
    previewText: "¿Quieres suscribirte a nuestra newsletter?",
  },
  {
    id: "boxed",
    name: "Caja destacada",
    description: "Formulario dentro de una tarjeta con fondo.",
    previewText: "Recibe novedades y recursos exclusivos.",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Diseño muy ligero, ideal para integrarlo en secciones.",
    previewText: "Suscríbete para no perderte nada.",
  },
];

export default function StepTemplates({ formId, onNext, onBack }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("simple");
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
        setSelectedTemplate(data.templateId || "simple");
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Error al cargar el formulario.");
        setLoading(false);
      }
    };

    if (formId) loadForm();
  }, [formId]);

  const handleSelect = (templateId) => {
    setSelectedTemplate(templateId);
  };

  const handleContinue = async () => {
    try {
      setSaving(true);
      setError(null);

      const ref = doc(db, "forms", formId);
      await updateDoc(ref, {
        templateId: selectedTemplate,
        step: 3,
        updatedAt: serverTimestamp(),
      });

      if (onNext) onNext();
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar la plantilla.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Cargando plantillas...</p>;
  if (error) return <p className="StepTemplates__error">{error}</p>;

  return (
    <div className="StepTemplates__container">
      <div className="StepTemplates__header">
        <div>
          <h3 className="StepTemplates__title">Elige una plantilla de formulario</h3>
          <p className="StepTemplates__subtitle">
            Selecciona el diseño base sobre el que luego podrás ajustar colores y estilos.
          </p>
        </div>
      </div>

      <div className="StepTemplates__grid">
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className={`StepTemplates__card ${
              selectedTemplate === tpl.id ? "selected" : ""
            }`}
            onClick={() => handleSelect(tpl.id)}
          >
            <div className="StepTemplates__preview">
              <p className="StepTemplates__previewTitle">{tpl.previewText}</p>

              <div className="StepTemplates__previewForm">
                <input type="email" placeholder="Tu email" disabled />
                <button type="button" disabled>Suscribirme</button>
              </div>
            </div>

            <div className="StepTemplates__info">
              <h4>{tpl.name}</h4>
              <p>{tpl.description}</p>
            </div>
          </button>
        ))}
      </div>

      {error && <p className="StepTemplates__error">{error}</p>}

      <div className="StepTemplates__actions">
        {onBack && (
          <button
            type="button"
            className="StepTemplates__backButton"
            onClick={onBack}
            disabled={saving}
          >
            Volver al tipo
          </button>
        )}

        <button
          type="button"
          className="StepTemplates__nextButton"
          onClick={handleContinue}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Siguiente: Configuración"}
        </button>
      </div>
    </div>
  );
}
