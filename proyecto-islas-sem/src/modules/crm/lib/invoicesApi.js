// Facturas en el servidor: subir el PDF, verlo y enviarlo al cliente por correo.
import { auth } from "../../../config/firebaseConfig";
import { API_BASE } from "../../contracts/lib/api";

async function call(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${API_BASE}/invoices/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token || ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw new Error(out.error || (r.status === 413 ? "El archivo es demasiado grande" : `Error ${r.status}`));
  return out;
}

const toBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
  fr.onerror = () => reject(new Error("No se pudo leer el archivo"));
  fr.readAsDataURL(file);
});

export async function uploadInvoicePdf(file) {
  if (!/\.pdf$/i.test(file.name)) throw new Error("La factura tiene que ser un PDF");
  if (file.size > 10 * 1024 * 1024) throw new Error("El PDF pasa de 10 MB");
  return (await call("pdf", { name: file.name, data: await toBase64(file) })).file;
}

export async function openInvoicePdf(pdf) {
  const w = window.open("", "_blank");
  try {
    const { url } = await call("pdf-url", { path: pdf.path });
    if (w) w.location.href = url; else window.location.href = url;
  } catch (e) {
    w?.close();
    throw e;
  }
}

export const sendInvoice = (id, { to, message }) => call("send", { id, to, message });
