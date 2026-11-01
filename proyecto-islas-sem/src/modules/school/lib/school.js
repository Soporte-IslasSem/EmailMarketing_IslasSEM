// Escuela › Alumnado prácticas: llamadas al servidor y datos comunes.
import { auth } from "../../../config/firebaseConfig";
import { API_BASE } from "../../contracts/lib/api";

export const STATUSES = ["Nuevo", "Disponible", "Asignado", "En prácticas", "Finalizado", "Descartado"];
export const statusClass = (s) => (s === "En prácticas" || s === "Finalizado" ? "ok" : s === "Descartado" ? "bad" : s === "Asignado" ? "info" : "warn");
export const fullName = (s) => [s.firstName, s.lastName].filter(Boolean).join(" ") || s.email || "Alumno/a";
export const LANG_LEVELS = ["Nativo", "C2", "C1", "B2", "B1", "A2", "A1"];
export const ORG = "islas-sem"; // la escuela pública es la de ISLAS SEM

async function staff(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${API_BASE}/school/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${token || ""}`, "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw new Error(out.error || `Error ${r.status}`);
  return out;
}

export async function openCv(id) {
  const w = window.open("", "_blank");
  try {
    const { url } = await staff("cv-url", { id });
    if (w) w.location.href = url; else window.location.href = url;
  } catch (e) {
    w?.close();
    throw e;
  }
}
export const regenerateCv = (id) => staff("cv-regenerate", { id });
export const newPlacementToken = async () => (await staff("placement-token")).token;

export async function publicApi(path, { method = "GET", body } = {}) {
  const r = await fetch(`${API_BASE}/school/${path}`, {
    method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw new Error(out.error || `Error ${r.status}`);
  return out;
}
export const matchCvUrl = (token, id) => `${API_BASE}/school/match/${encodeURIComponent(token)}/cv/${encodeURIComponent(id)}`;
export const publicFormUrl = () => `${window.location.origin}/alumnado`;
export const matchUrl = (token) => `${window.location.origin}/practicas/${token}`;

export const EMPTY_CV = {
  firstName: "", lastName: "", email: "", phone: "", city: "", hasCar: false, headline: "", specialties: [], profile: "",
  experience: [], education: [], skills: [], competencies: [], languages: [{ name: "Español", level: "Nativo" }],
};
