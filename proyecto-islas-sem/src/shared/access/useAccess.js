// Estado de acceso del usuario actual (ver AccessGate).
import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../../config/firebaseConfig";
import { useAuth } from "../hooks/useAuth";
import { DEFAULT_ORG_ID } from "../../modules/crm/lib/useOrg";

const norm = (s) => String(s || "").trim().toLowerCase();

// Último resultado "ok" por uid: al recargar la página se entra al momento y se vuelve a
// comprobar por detrás (las reglas y el servidor siguen frenando a quien ya no tenga acceso).
const CACHE_KEY = "islassem:accessOk";
const cachedOk = (uid) => { try { return !!uid && localStorage.getItem(CACHE_KEY) === uid; } catch { return false; } };
const saveOk = (uid, ok) => { try { ok ? localStorage.setItem(CACHE_KEY, uid) : localStorage.removeItem(CACHE_KEY); } catch { /* sin almacenamiento */ } };

// "checking" | "unverified" | "denied" | "ok"
export function useAccess() {
  const { user } = useAuth();
  // Resultado ligado al uid comprobado: al cambiar de cuenta vuelve a "checking".
  const [result, setResult] = useState(() => ({ uid: user?.uid ?? null, state: cachedOk(user?.uid) ? "ok" : "checking" }));
  const [tick, setTick] = useState(0);
  const recheck = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    if (!user) return undefined;
    (async () => {
      try {
        await user.reload().catch(() => {});
        const u = auth.currentUser || user;
        if (!u.emailVerified) { saveOk(u.uid, false); if (alive) setResult({ uid: u.uid, state: "unverified" }); return; }
        // El token lleva email_verified para las reglas: solo se renueva si aún no lo tiene.
        const tok = await u.getIdTokenResult().catch(() => null);
        if (!tok?.claims?.email_verified) await u.getIdToken(true).catch(() => {});
        const snap = await getDoc(doc(db, "organizations", DEFAULT_ORG_ID));
        // Con acceso: lista de Accesos o empleado (Administración › Empleados).
        const list = [...(snap.data()?.accessEmails || []), ...Object.keys(snap.data()?.memberRoles || {})].map(norm);
        const ok = list.includes(norm(u.email));
        saveOk(u.uid, ok);
        if (alive) setResult({ uid: u.uid, state: ok ? "ok" : "denied" });
      } catch {
        saveOk(user.uid, false);
        if (alive) setResult({ uid: user.uid, state: "denied" }); // las reglas no le dejan leer la organización
      }
    })();
    return () => { alive = false; };
  }, [user, tick]);

  const state = !user ? "checking" : result.uid === user.uid ? result.state : cachedOk(user.uid) ? "ok" : "checking";
  return { state, recheck };
}

