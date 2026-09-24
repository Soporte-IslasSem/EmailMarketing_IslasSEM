import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../../../config/firebaseConfig";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e) => {
    e.preventDefault();
    setMsg("");
    setError("");

    try {
      await sendPasswordResetEmail(auth, email);
      setMsg("Te hemos enviado un correo para restablecer tu contraseña.");
    } catch (err) {
      setError("No se pudo enviar el correo de recuperación.");
    }
  };

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <h2>Restablecer contraseña</h2>

      <form onSubmit={handleReset} style={{ maxWidth: "400px", margin: "0 auto" }}>
        <input
          type="email"
          placeholder="Tu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
        />

        <button type="submit" style={{ padding: "10px 20px" }}>
          Enviar enlace
        </button>

        {msg && <p style={{ color: "green" }}>{msg}</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
}
