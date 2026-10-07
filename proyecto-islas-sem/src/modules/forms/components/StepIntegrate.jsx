import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import "./../styles/StepIntegrate.styles.css";
import { buildEmbedCode, TYPE_LABEL } from "../lib/embedCode";

export default function StepIntegrate({ formId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(null);
  const [copied, setCopied] = useState(false);
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
        setFormData(data);

        await updateDoc(ref, {
          step: 6,
          updatedAt: serverTimestamp(),
        });

        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Error al cargar el formulario.");
        setLoading(false);
      }
    };

    if (formId) loadForm();
  }, [formId]);

  if (loading) return <p>Cargando integración...</p>;
  if (error) return <p className="StepIntegrate__error">{error}</p>;
  if (!formData) return null;

  // Código para incrustar (clásico o popup/barra/exit intent): ver lib/embedCode.js
  const fullCode = buildEmbedCode(formId, formData);

  // ✅ Copiar código
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Error al copiar:", err);
    }
  };

  // ✅ Crear formulario
  const handleCreateForm = async () => {
    try {
      const ref = doc(db, "forms", formId);
      await updateDoc(ref, {
        status: "created",
        updatedAt: serverTimestamp(),
      });
      // Directo a la ficha del formulario, donde está su código listo para copiar.
      window.location.href = `/dashboard/forms/${formId}`;
    } catch (err) {
      console.error(err);
      setError("No se pudo crear el formulario. Inténtalo de nuevo.");
    }
  };

  return (
    <div className="StepIntegrate__container">
      <h3 className="StepIntegrate__title">Integración del formulario</h3>
      <p className="StepIntegrate__subtitle">
        {formData.type && formData.type !== "classic"
          ? `Formulario tipo ${TYPE_LABEL[formData.type]}: pega este código una sola vez en tu web, justo antes de </body> (en WordPress, en el pie o con un plugin de "insertar código").`
          : "Copia y pega este código en tu sitio web, donde quieras que aparezca el formulario."}
      </p>

      <div className="StepIntegrate__codeBox">
        <pre>{fullCode}</pre>
      </div>

      <button className="StepIntegrate__copyButton" onClick={handleCopy}>
        {copied ? "¡Copiado!" : "Copiar código"}
      </button>

      <h4 className="StepIntegrate__previewTitle">Vista previa</h4>

      {/* ✅ Vista previa dinámica */}
      <div
        className="StepIntegrate__preview"
        style={{
          background: formData.design.bgColor,
          borderRadius: `${formData.design.borderRadius}px`,
        }}
      >
        <p
          style={{
            color: formData.design.textColor,
            fontSize: `${formData.design.fontSize}px`,
            fontWeight: formData.design.fontWeight,
            fontStyle: formData.design.fontStyle,
            textDecoration: formData.design.textDecoration,
            fontFamily: formData.design.fontFamily,
          }}
        >
          {formData.design.titleText}
        </p>

        <input
          type="email"
          placeholder="Tu correo electrónico"
          disabled
          style={{
            borderRadius: `${formData.design.borderRadius}px`,
            border: "1px solid #d1d5db",
          }}
        />

        <button
          disabled
          style={{
            background: formData.design.buttonColor,
            borderRadius: `${formData.design.borderRadius}px`,
          }}
        >
          Suscribirme
        </button>
      </div>

      <div className="StepIntegrate__actions">
        {onBack && (
          <button
            type="button"
            className="StepIntegrate__backButton"
            onClick={onBack}
          >
            Volver al diseño
          </button>
        )}

        <button
          type="button"
          className="StepIntegrate__createButton"
          onClick={handleCreateForm}
        >
          Crear formulario
        </button>
      </div>
    </div>
  );
}
