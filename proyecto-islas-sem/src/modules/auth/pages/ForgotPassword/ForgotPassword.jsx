import { useState } from "react";
import { auth } from "../../../../config/firebaseConfig";
import { sendPasswordResetEmail } from "firebase/auth";
import "./ForgotPassword.styles.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (err) {
      setError("No se pudo enviar el correo de recuperación");
    }
  };

  return (
    <div className="ForgotPage">
      <div className="forgot-card">

        {/* BOTÓN DE CERRAR */}
        <div className="close-btn" onClick={() => window.location.href = "/auth/login"}>
          ×
        </div>

        <img src="/islas-sem-logo.png" className="forgot-logo" />

        <h2>Recuperar contraseña</h2>
        <p className="forgot-slogan">
          Introduce tu correo para recibir un enlace de recuperación
        </p>

        {!sent ? (
          <form onSubmit={handleReset}>

            <label>Correo electrónico</label>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {error && <p className="error-msg">{error}</p>}

            <button className="forgot-btn" type="submit">
              Enviar enlace
            </button>

            <p className="back-login">
              <a href="/auth/login">Volver al inicio de sesión</a>
            </p>
          </form>
        ) : (
          <div className="success-box">
            <p>
              Te hemos enviado un correo con instrucciones para restablecer tu contraseña.
            </p>

            <button className="forgot-btn" onClick={() => window.location.href = "/auth/login"}>
              Volver al inicio de sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
