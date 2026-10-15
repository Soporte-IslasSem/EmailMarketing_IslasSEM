// Puerta de acceso a la app (panel y Restaurantes).
// Solo entra quien está en la lista de acceso (organizations/{org}.accessEmails, se gestiona
// en Administración › Sistema › Accesos) y tiene el email verificado (Google ya lo verifica;
// con usuario y contraseña hay que pulsar el enlace que llega por email).
// Las reglas de Firestore y el servidor aplican lo mismo: esto solo muestra la pantalla
// adecuada en vez de un panel vacío.
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "../../config/firebaseConfig";
import { useAuth } from "../hooks/useAuth";
import { useAccess } from "./useAccess";
import "./AccessGate.styles.css";

export default function AccessGate({ children }) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, recheck } = useAccess();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="AG__wait">Cargando…</div>;
  if (!user) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  if (state === "ok") return children;
  if (state === "checking") return <div className="AG__wait">Comprobando acceso…</div>;

  const out = async () => { await logout(); navigate("/auth/login"); };
  const resend = async () => {
    setBusy(true); setMsg("");
    try {
      await sendEmailVerification(auth.currentUser);
      setMsg(`Te hemos enviado el enlace a ${user.email}. Revisa también la carpeta de spam.`);
    } catch (e) {
      setMsg(e.code === "auth/too-many-requests" ? "Ya te enviamos uno hace poco. Espera unos minutos antes de pedir otro." : "No se pudo enviar: " + (e.code || e.message));
    } finally { setBusy(false); }
  };

  return (
    <div className="AG">
      <div className="AG__card">
        <img src="/islas-sem-logo.png" alt="ISLAS SEM" className="AG__logo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        {state === "unverified" ? (
          <>
            <h1>Verifica tu email</h1>
            <p>Para entrar tienes que confirmar que <b>{user.email}</b> es tuyo. Pulsa el botón, abre el enlace que te llega por email y vuelve aquí.</p>
            <div className="AG__btns">
              <button className="AG__btn primary" onClick={resend} disabled={busy}>{busy ? "Enviando…" : "Enviarme el enlace"}</button>
              <button className="AG__btn" onClick={recheck}>Ya lo he verificado</button>
            </div>
          </>
        ) : (
          <>
            <h1>No tienes acceso</h1>
            <p>La cuenta <b>{user.email}</b> no tiene permiso para entrar en ISLAS SEM. Si trabajas con nosotros, pide a un administrador que te dé acceso y vuelve a intentarlo.</p>
            <div className="AG__btns">
              <button className="AG__btn primary" onClick={recheck}>Volver a comprobar</button>
            </div>
          </>
        )}
        {msg && <p className="AG__msg">{msg}</p>}
        <button className="AG__link" onClick={out}>Cerrar sesión</button>
      </div>
    </div>
  );
}
