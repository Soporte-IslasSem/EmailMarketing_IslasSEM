// Estado de acceso del usuario actual (ver AccessGate).
import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../../config/firebaseConfig";
import { useAuth } from "../hooks/useAuth";
import { DEFAULT_ORG_ID } from "../../modules/crm/lib/useOrg";

const norm = (s) => String(s || "").trim().toLowerCase();

// "checking" | "unverified" | "denied" | "ok"
export function useAccess() {
  const { user } = useAuth();
  // Resultado ligado al uid comprobado: al cambiar de cuenta vuelve a "checking".
  const [result, setResult] = useState({ uid: null, state: "checking" });
  const [tick, setTick] = useState(0);
  const recheck = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    if (!user) return undefined;
    (async () => {
      try {
        await user.reload().catch(() => {});
        const u = auth.currentUser || user;
        if (!u.emailVerified) { if (alive) setResult({ uid: u.uid, state: "unverified" }); return; }
        await u.getIdToken(true).catch(() => {}); // el token lleva email_verified para las reglas
        const snap = await getDoc(doc(db, "organizations", DEFAULT_ORG_ID));
        const list = (snap.data()?.accessEmails || []).map(norm);
        if (alive) setResult({ uid: u.uid, state: list.includes(norm(u.email)) ? "ok" : "denied" });
      } catch {
        if (alive) setResult({ uid: user.uid, state: "denied" }); // las reglas no le dejan leer la organización
      }
    })();
    return () => { alive = false; };
  }, [user, tick]);

  const state = user && result.uid === user.uid ? result.state : "checking";
  return { state, recheck };
}

