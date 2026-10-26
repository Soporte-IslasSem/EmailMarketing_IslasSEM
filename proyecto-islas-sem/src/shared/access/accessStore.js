// Lo último que dijo el servidor sobre el acceso (empresa, administrador de la plataforma, modo
// soporte…), compartido por toda la app sin volver a preguntarlo.
import { useSyncExternalStore } from "react";

let info = null;
const listeners = new Set();
export function setAccessInfo(next) {
  info = next;
  listeners.forEach((l) => l());
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useAccessInfo = () => useSyncExternalStore(subscribe, () => info, () => info);
