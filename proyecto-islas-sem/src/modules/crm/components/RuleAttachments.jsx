// Archivos adjuntos de una regla de envío (CRM › Automatización): se suben al servidor de la app
// (que los guarda en Firebase Storage) y la regla guarda solo { path, name, size, type }.
// Al enviar, van adjuntos al correo del cliente o, si pesan mucho, como enlaces de descarga.
import { useRef, useState } from "react";
import { auth } from "../../../config/firebaseConfig";

const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";
const MAX = 10 * 1024 * 1024;
const OK_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|txt|csv|png|jpe?g|gif|webp|zip)$/i;
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function api(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${API_BASE}/automations/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token || ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw new Error(out.error || (r.status === 413 ? "El archivo es demasiado grande" : `HTTP ${r.status}`));
  return out;
}

const toBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
  fr.onerror = () => reject(new Error("No se pudo leer el archivo"));
  fr.readAsDataURL(file);
});

export default function RuleAttachments({ value, onChange, disabled }) {
  const files = Array.isArray(value) ? value : [];
  const input = useRef(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const add = async (list) => {
    setError("");
    const picked = [...list];
    const bad = picked.find((f) => !OK_EXT.test(f.name) || f.size > MAX || !f.size);
    if (bad) return setError(`"${bad.name}": ${!OK_EXT.test(bad.name) ? "tipo no admitido (PDF, Word, Excel, PowerPoint, imágenes, TXT, CSV o ZIP)" : "pasa de 10 MB o está vacío"}.`);
    if (files.length + picked.length > 10) return setError("Como máximo 10 archivos por regla.");
    const added = [];
    try {
      for (const f of picked) {
        setBusy(`Subiendo ${f.name}…`);
        const { file } = await api("adjunto", { name: f.name, data: await toBase64(f) });
        added.push(file);
      }
    } catch (e) {
      setError("No se pudo subir: " + e.message);
    } finally {
      if (added.length) await onChange([...files, ...added]);
      setBusy("");
      if (input.current) input.current.value = "";
    }
  };

  const open = async (f) => {
    try { window.open((await api("adjunto-url", { path: f.path })).url, "_blank", "noopener"); }
    catch (e) { setError("No se pudo abrir: " + e.message); }
  };

  const remove = async (f) => {
    if (!window.confirm(`¿Quitar "${f.name}" de esta regla? Ya no se enviará.`)) return;
    await onChange(files.filter((x) => x.path !== f.path));
    api("adjunto-borrar", { path: f.path }).catch(() => {}); // si falla, solo queda el archivo guardado
  };

  return (
    <div style={{ margin: "4px 0 6px" }}>
      {files.map((f) => (
        <div key={f.path} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "3px 0" }}>
          <span>📎</span>
          <span className="crm-link" onClick={() => open(f)} title="Ver el archivo" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
          <span style={{ color: "#9aa8a8" }}>{kb(f.size || 0)}</span>
          {!disabled && <span style={{ color: "#b9c2c2", cursor: "pointer" }} title="Quitar" onClick={() => remove(f)}>✕</span>}
        </div>
      ))}
      {!disabled && (
        <>
          <input ref={input} type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip" onChange={(e) => e.target.files?.length && add(e.target.files)} />
          <button type="button" className="crm-btn ghost sm" style={{ width: "100%" }} disabled={!!busy} onClick={() => input.current?.click()}>
            {busy || "📎 Adjuntar archivo"}
          </button>
        </>
      )}
      {error && <div style={{ color: "#b0304c", fontSize: 12, marginTop: 4 }}>{error}</div>}
      {files.length > 0 && <div style={{ color: "#9aa8a8", fontSize: 11.5, marginTop: 3 }}>Se envían adjuntos al correo (si en total pasan de 8 MB, como enlaces de descarga).</div>}
    </div>
  );
}
