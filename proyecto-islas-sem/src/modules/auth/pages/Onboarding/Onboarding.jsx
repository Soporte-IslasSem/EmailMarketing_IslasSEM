// Alta de empresa: quien se registró para crear la cuenta de su empresa (y ya verificó su email)
// le pone nombre y entra. Queda como administrador, con la prueba gratis.
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { useAccess } from "../../../../shared/access/useAccess";
import { api } from "../../../../shared/api";
import "../../../../shared/access/AccessGate.styles.css";

export default function Onboarding() {
  const { user, logout } = useAuth();
  const { state } = useAccess();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((s) => setName((n) => n || s.data()?.signupCompany || "")).catch(() => {});
  }, [user]);

  if (state === "ok") return <Navigate to="/dashboard" replace />;

  const create = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Escribe el nombre de tu empresa.");
    setBusy(true); setError("");
    try {
      await api("orgs/create", { name: name.trim() });
      try { localStorage.removeItem("islassem:accessOk"); } catch { /* sin almacenamiento */ }
      window.location.href = "/dashboard"; // recarga: empieza con la empresa nueva
    } catch (er) { setError(er.message); setBusy(false); }
  };

  return (
    <div className="AG">
      <form className="AG__card" onSubmit={create}>
        <h1>Crea la cuenta de tu empresa</h1>
        <p>Vas a crear el espacio de tu empresa: CRM, email marketing, contratos y WhatsApp. Tendrás <b>14 días de prueba gratis</b> y después eliges plan.</p>
        <label style={{ display: "block", textAlign: "left", fontSize: 13, fontWeight: 600, margin: "14px 0 6px" }}>Nombre de la empresa</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder="p. ej. Talleres Pérez S.L."
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #cfdcdc", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }} />
        <p style={{ fontSize: 12.5, color: "#6b7d7d", textAlign: "left" }}>Serás el administrador ({user?.email}). Después podrás invitar a tu equipo desde Administración › Sistema › Accesos.</p>
        {error && <p className="AG__msg" style={{ color: "#b0304c" }}>{error}</p>}
        <div className="AG__btns">
          <button className="AG__btn primary" type="submit" disabled={busy}>{busy ? "Creando…" : "Crear empresa"}</button>
        </div>
        <button type="button" className="AG__link" onClick={async () => { await logout(); window.location.href = "/auth/login"; }}>Cerrar sesión</button>
      </form>
    </div>
  );
}
