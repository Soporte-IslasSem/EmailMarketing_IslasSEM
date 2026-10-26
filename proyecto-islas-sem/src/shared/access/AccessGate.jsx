// Puerta de acceso a la app (panel y Restaurantes).
// Solo entra quien figura en una empresa (su lista de acceso, Administración › Sistema ›
// Accesos, o sus empleados) y tiene el email verificado (Google ya lo verifica; con usuario y
// contraseña hay que pulsar el enlace que llega por email). Si su empresa está suspendida, se
// le avisa; si aún no tiene empresa pero se registró para crear la suya, va al alta.
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
  const { state, recheck, info } = useAccess();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const wait = (txt) => <div className="AG__wait"><span className="AG__spin" aria-hidden="true" />{txt}</div>;
  if (loading) return wait("Cargando…");
  if (!user) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  if (state === "ok") return children;
  if (state === "checking") return wait("Comprobando acceso…");
  if (state === "noorg" && location.pathname !== "/alta-empresa") return <Navigate to="/alta-empresa" replace />;
  if (state === "noorg") return children;

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
        ) : state === "suspended" ? (
          <>
            <h1>Cuenta suspendida</h1>
            <p>El acceso de tu empresa está suspendido{info?.orgName ? <> (<b>{info.orgName}</b>)</> : null}. {info?.isAdmin ? "Revisa la suscripción para volver a activarlo." : "Pide al administrador de tu empresa que revise la suscripción."}</p>
            <div className="AG__btns">
              {info?.isAdmin && <button className="AG__btn primary" onClick={() => navigate("/suscripcion")}>Ver suscripción</button>}
              <button className="AG__btn" onClick={recheck}>Volver a comprobar</button>
            </div>
          </>
        ) : (
          <>
            <h1>No tienes acceso</h1>
            <p>La cuenta <b>{user.email}</b> no tiene acceso a ninguna empresa. Si trabajas en una, pide a su administrador que te dé acceso y vuelve a intentarlo.</p>
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
