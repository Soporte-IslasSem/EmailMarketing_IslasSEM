// Multi-tenant foundation (oculto para el cliente por ahora).
// Cada usuario pertenece a una organización (orgId). Todos los datos del CRM
// se guardan con ese orgId, de modo que la plataforma queda preparada para
// ser multi-empresa (SaaS) más adelante sin reescribir nada.
//
// Mientras el cliente hace pruebas, todos los usuarios caen en la misma
// organización (DEFAULT_ORG_ID = "islas-sem"). Cuando se abra el SaaS, bastará
// con crear organizaciones distintas y asignar orgId por invitación.
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth";

export const DEFAULT_ORG_ID = "islas-sem";
export const DEFAULT_ORG_NAME = "ISLAS SEM";

// Cache por sesión para no re-crear el perfil en cada componente.
let _profileCache = null;

async function ensureProfile(user) {
  if (_profileCache && _profileCache.uid === user.uid) return _profileCache;

  const uref = doc(db, "users", user.uid);
  const snap = await getDoc(uref);

  if (snap.exists() && snap.data().orgId) {
    _profileCache = { uid: user.uid, orgId: snap.data().orgId, role: snap.data().role || "member" };
    return _profileCache;
  }

  // Primer acceso: asignar a la organización por defecto y crearla si falta.
  const orgId = DEFAULT_ORG_ID;
  await setDoc(
    uref,
    { email: user.email, orgId, role: "owner", createdAt: serverTimestamp() },
    { merge: true }
  );
  await setDoc(
    doc(db, "organizations", orgId),
    { name: DEFAULT_ORG_NAME, createdAt: serverTimestamp() },
    { merge: true }
  );

  _profileCache = { uid: user.uid, orgId, role: "owner" };
  return _profileCache;
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
