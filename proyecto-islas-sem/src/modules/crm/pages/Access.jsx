// Administración › Sistema › Accesos: quién puede entrar en la app.
// organizations/{org}.accessEmails. Lo aplican la app (AccessGate), las reglas de Firestore
// y el servidor. Solo los administradores pueden cambiarlo.
import { useEffect, useState } from "react";
import { arrayRemove, arrayUnion, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import { useOrg } from "../lib/useOrg";
import "../crm.styles.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const norm = (s) => String(s || "").trim().toLowerCase();

export default function Access() {
  const { orgId } = useOrg();
  const [emails, setEmails] = useState(null);
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState("");
  const me = norm(auth.currentUser?.email);

  useEffect(() => {
    if (!orgId) return undefined;
    return onSnapshot(doc(db, "organizations", orgId), (s) => setEmails([...(s.data()?.accessEmails || [])].map(norm).sort()), (e) => setMsg("No se pudo leer: " + e.message));
  }, [orgId]);

  const add = async () => {
    const e = norm(value);
    if (!EMAIL_RE.test(e)) return setMsg("Escribe un email válido.");
    if (emails?.includes(e)) return setMsg("Ese email ya tiene acceso.");
    try { await updateDoc(doc(db, "organizations", orgId), { accessEmails: arrayUnion(e) }); setValue(""); setMsg(`✓ ${e} ya puede entrar.`); }
    catch (er) { setMsg("No se pudo añadir: " + er.message); }
  };
  const remove = async (e) => {
    if (e === me) return setMsg("No puedes quitarte el acceso a ti mismo.");
    if (!window.confirm(`¿Quitar el acceso a ${e}? Dejará de poder entrar en la app.`)) return;
    try { await updateDoc(doc(db, "organizations", orgId), { accessEmails: arrayRemove(e) }); setMsg(`${e} ya no tiene acceso.`); }
    catch (er) { setMsg("No se pudo quitar: " + er.message); }
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Accesos</h1>
          <p>Solo pueden entrar en la app los emails de esta lista. Quien se registre sin estar aquí verá «No tienes acceso».</p>
        </div>
      </div>
      <div style={{ background: "#fff", border: "1px solid var(--crm-line)", borderRadius: 12, padding: 18, maxWidth: 640 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="crm-search" style={{ margin: 0, maxWidth: "none", flex: 1 }} type="email" placeholder="email@islassem.com" value={value}
            onChange={(e) => { setValue(e.target.value); setMsg(""); }} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="crm-btn" onClick={add} disabled={!orgId}>Dar acceso</button>
        </div>
        {msg && <p style={{ fontSize: 13, margin: "10px 0 0", color: /^No|Escribe|Ese/.test(msg) ? "#b0304c" : "var(--crm-teal-dark)" }}>{msg}</p>}
        <p style={{ fontSize: 13, color: "var(--crm-muted)", margin: "12px 0 0" }}>
          La persona entra con <b>«Acceder con Google»</b> (si su email es de Google) o se registra con ese email y contraseña; en ese caso
          tendrá que confirmar su email con el enlace que le llega. Lo que ve dentro depende de su rol en Empleados.
        </p>
        <table className="crm-table" style={{ marginTop: 14 }}>
          <thead><tr><th>Email con acceso</th><th></th></tr></thead>
          <tbody>
            {emails === null ? <tr><td colSpan={2} className="crm-loading">Cargando…</td></tr>
              : emails.length ? emails.map((e) => (
                <tr key={e}>
                  <td>{e}{e === me && <span style={{ color: "var(--crm-muted)", fontSize: 12 }}> · tú</span>}</td>
                  <td style={{ textAlign: "right" }}>{e !== me && <button className="crm-btn ghost sm" onClick={() => remove(e)}>Quitar acceso</button>}</td>
                </tr>
              )) : <tr><td colSpan={2} style={{ color: "var(--crm-muted)" }}>Nadie tiene acceso todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
