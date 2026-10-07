import { useState } from "react";
import { auth } from "../../../../config/firebaseConfig";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";

import { db } from "../../../../config/firebaseConfig";
import { doc, setDoc, getDoc } from "firebase/firestore";

import "./Register.styles.css";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [aceptaPoliticas, setAceptaPoliticas] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");

  const provider = new GoogleAuthProvider();

  // ------------------------------
  // LOGIN CON GOOGLE (CORREGIDO)
  // ------------------------------
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const exists = await getDoc(userRef);

      if (!exists.exists()) {
        await setDoc(userRef, {
          email: user.email,
          marketing: false,
          aceptoPoliticas: false,
          fechaAceptacion: null,
          versionPolitica: "v1.0",
          provider: "google"
        });
      }

      window.location.href = "/dashboard";
    } catch (err) {
      setError("Error al iniciar sesión con Google");
    }
  };

  // ------------------------------
  // REGISTRO CON EMAIL (FUNCIONAL)
  // ------------------------------
  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (!aceptaPoliticas) {
      setError("Debes aceptar las Políticas de Privacidad para continuar.");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        email,
        marketing,
        aceptoPoliticas: true,
        fechaAceptacion: new Date().toISOString(),
        versionPolitica: "v1.0",
        provider: "email"
      });

      window.location.href = "/dashboard";
    } catch (err) {
      setError("No se pudo crear la cuenta");
    }
  };

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasLength = password.length >= 8;

  return (
    <div className="RegisterPage">
      <div className="register-card">

        <div className="close-btn" onClick={() => window.location.href = "/"}>
          ×
        </div>

        <div className="header-block">
          <img src="/islas-sem-logo.png" className="register-logo-inside" />
          <h2>Crear cuenta</h2>
          <p className="register-slogan">Influir positivamente cuidando tu negocio</p>
        </div>

        <div className="google-btn-wrapper">
          <button className="google-btn" onClick={handleGoogleLogin}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" />
            Acceder con Google
          </button>
        </div>

        <div className="divider-wrapper">
          <div className="divider">
            <span>o</span>
          </div>
        </div>

        <form onSubmit={handleRegister} className="form-inner">

          <label>Email</label>
          <input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label>Contraseña</label>
          <input
            type="password"
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {password.length > 0 && (
            <ul className="password-rules">
              <li className={hasLower ? "ok" : ""}>Al menos una minúscula</li>
              <li className={hasUpper ? "ok" : ""}>Al menos una mayúscula</li>
              <li className={hasNumber ? "ok" : ""}>Al menos un número</li>
              <li className={hasLength ? "ok" : ""}>Más de 8 caracteres</li>
            </ul>
          )}

          <label className="checkbox">
            <input
              type="checkbox"
              checked={aceptaPoliticas}
              onChange={() => setAceptaPoliticas(!aceptaPoliticas)}
            />
            Acepto las{" "}
            <span className="legal-link" onClick={() => setShowModal(true)}>
              Políticas de Privacidad
            </span>.
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={marketing}
              onChange={() => setMarketing(!marketing)}
            />
            Autorizo el tratamiento de mis datos personales para propósitos de marketing.
          </label>

          {error && <p className="error-msg">{error}</p>}

          <div className="register-btn-wrapper">
            <button className="register-btn" type="submit">
              Crear cuenta
            </button>
          </div>

          <p className="legal-text">
            Al registrarte aceptas nuestros <a href="https://islassem.com/terminos-y-condiciones-servicios-islas-sem" target="_blank" rel="noreferrer">términos de uso</a> y{" "}
            <a href="https://islassem.com/politicas-de-privacidad" target="_blank" rel="noreferrer">política de privacidad</a>.
          </p>

          <p className="login-redirect">
            ¿Ya tienes una cuenta? <a href="/auth/login">Inicia sesión</a>
          </p>

        </form>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Políticas de Privacidad</h3>
            <p>
              Luego colocaré las políticas de privacidad.
            </p>

            <div className="modal-buttons">
              <button className="modal-accept" onClick={() => setShowModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
