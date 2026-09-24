import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import "./../styles/StepIntegrate.styles.css";

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

  // ✅ Código dinámico según personalización
  const htmlCode = `
<!-- Formulario generado con Islas SEM -->
<div id="islassem-widget-${formId}" style="max-width: 420px;">
  <form id="islassem-form-${formId}">
    <p style="
      color: ${formData.design.textColor};
      font-size: ${formData.design.fontSize}px;
      font-weight: ${formData.design.fontWeight};
      font-style: ${formData.design.fontStyle};
      text-decoration: ${formData.design.textDecoration};
      font-family: ${formData.design.fontFamily};
    ">
      ${formData.design.titleText}
    </p>

    <input
      type="email"
      id="islassem-email-${formId}"
      required
      placeholder="Tu correo electrónico"
      style="
        width: 100%;
        padding: 10px;
        border-radius: ${formData.design.borderRadius}px;
        border: 1px solid #d1d5db;
        margin-bottom: 10px;
      "
    />

    <button
      type="submit"
      style="
        width: 100%;
        padding: 10px;
        background: ${formData.design.buttonColor};
        color: #ffffff;
        border-radius: ${formData.design.borderRadius}px;
        border: none;
        font-weight: 600;
      "
    >
      Suscribirme
    </button>

    <p id="islassem-msg-${formId}" style="margin-top: 10px; font-size: 14px;"></p>
  </form>
</div>
  `.trim();

  const scriptCode = `
<!-- Script de Islas SEM -->
<script>
(function () {
  var form = document.getElementById("islassem-form-${formId}");
  var input = document.getElementById("islassem-email-${formId}");
  var msg = document.getElementById("islassem-msg-${formId}");
  var successMessage = ${JSON.stringify(formData.successMessage || "¡Gracias por suscribirte!")};
  var redirectUrl = ${JSON.stringify(formData.redirectUrl || "")};

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    msg.textContent = "";

    fetch("https://us-central1-email-marketing-islassem.cloudfunctions.net/submitForm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formId: "${formId}", email: input.value.trim() })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          form.reset();
          msg.style.color = "#1a7f37";
          msg.textContent = successMessage;
          if (redirectUrl) window.location.href = redirectUrl;
        } else {
          msg.style.color = "#c0392b";
          msg.textContent = data.error || "No se pudo completar la suscripción.";
        }
      })
      .catch(function () {
        msg.style.color = "#c0392b";
        msg.textContent = "No se pudo completar la suscripción. Inténtalo de nuevo.";
      });
  });
})();
</script>
  `.trim();

  const fullCode = `${htmlCode}\n\n${scriptCode}`;

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
      alert("Formulario creado correctamente.");
      window.location.href = "/dashboard/forms";
    } catch (err) {
      console.error(err);
      alert("Error al crear el formulario.");
    }
  };

  return (
    <div className="StepIntegrate__container">
      <h3 className="StepIntegrate__title">Integración del formulario</h3>
      <p className="StepIntegrate__subtitle">
        Copia y pega este código en tu sitio web para mostrar el formulario.
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
