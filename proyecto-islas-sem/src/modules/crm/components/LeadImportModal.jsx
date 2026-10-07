// Importar prospectos desde CSV o Excel. Reconoce las columnas por nombre (es/en),
// muestra un resumen antes de importar y no duplica emails que ya existen como
// prospecto o contacto.
import { useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import CrmModal from "./CrmModal";
import { LEAD_SOURCES, LEAD_STATUSES } from "../lib/crm";

const FIELDS = {
  firstName: /^(nombre|first ?name|name)$/i,
  lastName: /^(apellidos?|last ?name|surname)$/i,
  email: /^(e-?mail|correo( electr[oó]nico)?)$/i,
  phone: /^(tel[eé]fono|m[oó]vil|movil|phone|celular|whatsapp)$/i,
  company: /^(empresa|compa[nñ][ií]a|company|organizaci[oó]n)$/i,
  source: /^(origen|fuente|source|recorrido)$/i,
  status: /^(estado|etapa|status)$/i,
  estimatedValue: /^(valor( estimado)?|importe|value)$/i,
  notes: /^(notas?|comentarios?|observaciones|notes)$/i,
};
const LABEL = {
  firstName: "Nombre", lastName: "Apellidos", email: "Email", phone: "Teléfono", company: "Empresa",
  source: "Origen", status: "Estado", estimatedValue: "Valor", notes: "Notas",
};
const norm = (v) => String(v ?? "").trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function mapColumns(headers) {
  const map = {};
  headers.forEach((h) => {
    const key = Object.keys(FIELDS).find((k) => FIELDS[k].test(norm(h)));
    if (key && !map[key]) map[key] = h;
  });
  return map;
}

async function readFile(file) {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const wb = XLSX.read(await file.arrayBuffer());
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  }
  return new Promise((resolve, reject) =>
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => resolve(r.data), error: reject })
  );
}

export default function LeadImportModal({ orgId, existingLeads, existingContacts, onClose }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResult("");
    try {
      const rows = await readFile(file);
      if (!rows.length) return setError("El archivo está vacío.");
      const map = mapColumns(Object.keys(rows[0]));
      if (!map.email && !map.firstName) return setError("No encuentro columnas de Nombre ni Email. Revisa la primera fila (cabeceras).");
      const known = new Set([...existingLeads, ...existingContacts].map((x) => norm(x.email).toLowerCase()).filter(Boolean));
      const seen = new Set();
      const ok = [], dupes = [], invalid = [];
      rows.forEach((r) => {
        const get = (k) => (map[k] ? norm(r[map[k]]) : "");
        const email = get("email").toLowerCase();
        const lead = {
          firstName: get("firstName"), lastName: get("lastName"), email, phone: get("phone"), whatsapp: "",
          company: get("company"), responsable: "", notes: get("notes"),
          source: LEAD_SOURCES.find((s) => s.toLowerCase() === get("source").toLowerCase()) || "Importado",
          status: LEAD_STATUSES.find((s) => s.toLowerCase() === get("status").toLowerCase()) || "Nuevo",
          estimatedValue: parseFloat(get("estimatedValue").replace(/\./g, "").replace(",", ".")) || 0,
        };
        if (!lead.firstName && !email) return invalid.push(r);
        if (email && !EMAIL_RE.test(email)) return invalid.push(r);
        if (email && (known.has(email) || seen.has(email))) return dupes.push(lead);
        if (email) seen.add(email);
        ok.push(lead);
      });
      setPreview({ file: file.name, total: rows.length, map, ok, dupes, invalid });
    } catch (err) {
      setError("No se pudo leer el archivo: " + (err.message || err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < preview.ok.length; i += 400) {
        const batch = writeBatch(db);
        preview.ok.slice(i, i + 400).forEach((lead) =>
          batch.set(doc(collection(db, "leads")), { ...lead, orgId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), importedAt: Date.now() })
        );
        await batch.commit();
      }
      setResult(`Importados ${preview.ok.length} prospecto(s).`);
      setPreview(null);
    } catch (err) {
      setError("Error al importar: " + (err.code || err.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CrmModal
      title="Importar prospectos"
      onClose={onClose}
      maxWidth={640}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>{result ? "Cerrar" : "Cancelar"}</button>
          {preview && (
            <button className="crm-btn" onClick={doImport} disabled={busy || !preview.ok.length}>
              {busy ? "Importando…" : `Importar ${preview.ok.length}`}
            </button>
          )}
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Sube un <b>CSV</b> o <b>Excel</b> con una fila de cabeceras. Columnas reconocidas: Nombre, Apellidos, Email,
        Teléfono, Empresa, Origen, Estado, Valor y Notas.
      </p>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFile} />
      {error && <p style={{ color: "#b0304c", fontSize: 13 }}>{error}</p>}
      {result && <p style={{ color: "#136B68", fontWeight: 600 }}>{result}</p>}
      {preview && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 6px" }}><b>{preview.file}</b> · {preview.total} fila(s)</p>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--crm-muted)" }}>
            Columnas detectadas: {Object.entries(preview.map).map(([k, h]) => `${LABEL[k]} ← "${h}"`).join(" · ") || "ninguna"}
          </p>
          <ul style={{ margin: "6px 0 0" }}>
            <li><b>{preview.ok.length}</b> se importarán</li>
            {preview.dupes.length > 0 && <li>{preview.dupes.length} ya existen (mismo email) y se omiten</li>}
            {preview.invalid.length > 0 && <li>{preview.invalid.length} sin nombre ni email válido y se omiten</li>}
          </ul>
        </div>
      )}
    </CrmModal>
  );
}
