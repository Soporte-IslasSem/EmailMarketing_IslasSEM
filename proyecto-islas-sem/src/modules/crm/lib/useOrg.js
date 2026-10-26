// Empresa (organización) del usuario. Cada usuario pertenece a una (users/{uid}.orgId) y todos
// los datos del CRM se guardan con ese orgId; las reglas de Firestore no dejan ver los de otra.
// El orgId lo pone el servidor al comprobar el acceso (/api/access/check): la app nunca lo elige.
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth";
import { fetchAccess } from "../../../shared/access/checkAccess";

// La primera empresa (formularios fijos, Talento Digital…).
export const DEFAULT_ORG_ID = "islas-sem";

// Cache por sesión para no leer el perfil en cada componente.
let _profileCache = null;

async function ensureProfile(user) {
  if (_profileCache && _profileCache.uid === user.uid) return _profileCache;
  const uref = doc(db, "users", user.uid);
  let snap = await getDoc(uref).catch(() => null);
  if (!snap?.exists() || !snap.data().orgId) {
    // Sin empresa en el perfil: el servidor la busca por su email y la guarda.
    await fetchAccess(user);
    snap = await getDoc(uref).catch(() => null);
  }
  const orgId = snap?.exists() ? snap.data().orgId || null : null;
  _profileCache = orgId ? { uid: user.uid, orgId, role: snap.data().role || "member" } : null;
  return { uid: user.uid, orgId, role: snap?.data()?.role || "member" };
}

export function useOrg() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState(_profileCache?.orgId || null);
  const [role, setRole] = useState(_profileCache?.role || null);
  const [ready, setReady] = useState(!!_profileCache);

  useEffect(() => {
    let alive = true;
    if (!user) {
      setOrgId(null);
      setRole(null);
      setReady(false);
      return;
    }
    ensureProfile(user)
      .then((p) => {
        if (!alive) return;
        setOrgId(p.orgId);
        setRole(p.role);
        setReady(true);
      })
      .catch((e) => {
        console.error("[useOrg] no se pudo resolver la organización:", e);
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  return { orgId, role, ready, user };
}
