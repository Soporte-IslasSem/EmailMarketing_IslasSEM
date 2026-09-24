import { useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../../../../config/firebaseConfig";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";

import { db } from "../../../../config/firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";

import "./Login.styles.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

      // Si el usuario NO tiene documento, crearlo
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
  // LOGIN CON EMAIL (FUNCIONAL)
  // ------------------------------
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/dashboard";
    } catch (err) {
      setError("Credenciales incorrectas");
    }
  };

  return (
    <div className="LoginPage">
      <div className="login-card">

        <div className="close-btn" onClick={() => window.location.href = "/"}>
          ×
        </div>

        <img
          src="/islas-sem-logo.png"
          alt="ISLAS SEM"
          className="login-logo-inside"
        />

        <h2>Iniciar sesión</h2>

        <p className="login-slogan">
          Influir positivamente cuidando tu negocio
        </p>

        <button className="google-btn" onClick={handleGoogleLogin}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" />
          Acceder con Google
        </button>

        <div className="divider">
          <span>o</span>
        </div>

        <form onSubmit={handleLogin}>

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

          <p className="forgot-password">
            <Link to="/auth/forgot-password">He olvidado mi contraseña</Link>
          </p>

          {error && <p className="error-msg">{error}</p>}

          <button className="login-btn" type="submit">
            Entrar
          </button>

          <p className="register-link">
            ¿No tienes cuenta?{" "}
            <Link to="/auth/register">Crear cuenta</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
