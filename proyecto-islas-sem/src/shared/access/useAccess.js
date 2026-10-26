// Estado de acceso del usuario actual (ver AccessGate). Lo decide el servidor: la empresa del
// usuario, si está activa y si es administrador.
import { useCallback, useEffect, useState } from "react";
import { auth } from "../../config/firebaseConfig";
import { useAuth } from "../hooks/useAuth";
import { fetchAccess } from "./checkAccess";

// Último resultado "ok" por uid: al recargar la página se entra al momento y se vuelve a
// comprobar por detrás (las reglas y el servidor siguen frenando a quien ya no tenga acceso).
const CACHE_KEY = "islassem:accessOk";
const cachedOk = (uid) => { try { return !!uid && localStorage.getItem(CACHE_KEY) === uid; } catch { return false; } };
const saveOk = (uid, ok) => { try { ok ? localStorage.setItem(CACHE_KEY, uid) : localStorage.removeItem(CACHE_KEY); } catch { /* sin almacenamiento */ } };

// "checking" | "unverified" | "denied" | "suspended" | "noorg" | "ok"
export function useAccess() {
  const { user } = useAuth();
  // Resultado ligado al uid comprobado: al cambiar de cuenta vuelve a "checking".
  const [result, setResult] = useState(() => ({ uid: user?.uid ?? null, state: cachedOk(user?.uid) ? "ok" : "checking", info: null }));
  const [tick, setTick] = useState(0);
  const recheck = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    if (!user) return undefined;
    (async () => {
      await user.reload().catch(() => {});
      const u = auth.currentUser || user;
      if (!u.emailVerified) { saveOk(u.uid, false); if (alive) setResult({ uid: u.uid, state: "unverified", info: null }); return; }
      // El token lleva email_verified para las reglas: solo se renueva si aún no lo tiene.
      const tok = await u.getIdTokenResult().catch(() => null);
      if (!tok?.claims?.email_verified) await u.getIdToken(true).catch(() => {});
      const info = await fetchAccess(u);
      if (!info) {
        // Servidor caído: si ya había entrado antes, sigue (las reglas frenan igual).
        if (alive) setResult({ uid: u.uid, state: cachedOk(u.uid) ? "ok" : "denied", info: null });
        return;
      }
      const state = info.allowed ? "ok" : info.orgId && info.status === "suspended" ? "suspended" : info.canCreateOrg ? "noorg" : "denied";
      saveOk(u.uid, state === "ok");
      if (alive) setResult({ uid: u.uid, state, info });
    })();
    return () => { alive = false; };
  }, [user, tick]);

  const state = !user ? "checking" : result.uid === user.uid ? result.state : cachedOk(user.uid) ? "ok" : "checking";
  return { state, recheck, info: result.uid === user?.uid ? result.info : null };
}
