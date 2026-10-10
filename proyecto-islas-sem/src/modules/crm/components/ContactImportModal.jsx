// Importar contactos desde CSV o Excel. Reconoce las columnas por nombre (es/en), muestra
// un resumen antes de importar, no duplica emails existentes (opcionalmente completa sus
// datos) y asigna el tipo de cliente si la columna coincide con uno de la lista.
import { useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import CrmModal from "./CrmModal";

const FIELDS = {
  firstName: /^(nombre|first ?name|name)$/i,
  lastName: /^(apellidos?|last ?name|surname)$/i,
  email: /^(e-?mail|correo( electr[oó]nico)?)$/i,
  phone: /^(tel[eé]fono|m[oó]vil|movil|phone|celular|whatsapp)$/i,
  company: /^(empresa|compa[nñ][ií]a|company|organizaci[oó]n)$/i,
  role: /^(cargo|puesto|position|job ?title)$/i,
  dni: /^(dni|nif|dni\/nif|cif|documento)$/i,
  address: /^(direcci[oó]n|address)$/i,
  city: /^(ciudad|localidad|municipio|city)$/i,
  province: /^(provincia|province|state)$/i,
  clientType: /^(tipo( de)? cliente|tipo|client ?type)$/i,
  tags: /^(etiquetas?|tags?)$/i,
  notes: /^(notas?|comentarios?|observaciones|notes)$/i,
};
const LABEL = {
  firstName: "Nombre", lastName: "Apellidos", email: "Email", phone: "Teléfono", company: "Empresa", role: "Cargo",
  dni: "DNI/NIF", address: "Dirección", city: "Ciudad", province: "Provincia", clientType: "Tipo de cliente", tags: "Etiquetas", notes: "Notas",
};
const norm = (v) => String(v ?? "").trim();
const plain = (v) => norm(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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

// existing: contactos actuales (todos); types: tipos de cliente; canSetType: solo administradores.
export default function ContactImportModal({ orgId, existing, types, canSetType, nextNumber, onClose }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setResult("");
    try {
      const rows = await readFile(file);
      if (!rows.length) return setError("El archivo está vacío.");
      const map = mapColumns(Object.keys(rows[0]));
      if (!map.email && !map.firstName) return setError("No encuentro columnas de Nombre ni Email. Revisa la primera fila (cabeceras).");
      const byEmail = new Map(existing.filter((x) => x.email).map((x) => [norm(x.email).toLowerCase(), x]));
      const typeByName = new Map(types.flatMap((t) => [[plain(t.label), t.id], [plain(t.id), t.id]]));
      const seen = new Set();
      const ok = [], dupes = [], invalid = [], unknownTypes = new Set();
      rows.forEach((r) => {
        const get = (k) => (map[k] ? norm(r[map[k]]) : "");
        const email = get("email").toLowerCase();
        const typeRaw = get("clientType");
        const clientType = typeRaw ? typeByName.get(plain(typeRaw)) || "" : "";
        if (typeRaw && !clientType) unknownTypes.add(typeRaw);
        const c = {
          firstName: get("firstName"), lastName: get("lastName"), email, phone: get("phone"), whatsapp: "",
          company: get("company"), role: get("role"), dni: get("dni"), address: get("address"), city: get("city"),
          province: get("province"), notes: get("notes"), tags: get("tags").split(/[,;]/).map(norm).filter(Boolean),
          ...(canSetType && clientType ? { clientType } : {}),
        };
        if (!c.firstName && !email) return invalid.push(r);
        if (email && !EMAIL_RE.test(email)) return invalid.push(r);
        if (email && seen.has(email)) return dupes.push({ c, prev: null });
        if (email && byEmail.has(email)) { seen.add(email); return dupes.push({ c, prev: byEmail.get(email) }); }
        if (email) seen.add(email);
        ok.push(c);
      });
      setPreview({ file: file.name, total: rows.length, map, ok, dupes, invalid, unknownTypes: [...unknownTypes] });
    } catch (err) {
      setError("No se pudo leer el archivo: " + (err.message || err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updatable = preview ? preview.dupes.filter((d) => d.prev) : [];

  const doImport = async () => {
    setBusy(true); setError("");
    try {
      const me = String(auth.currentUser?.email || "").toLowerCase();
      const ops = [];
      let n = nextNumber;
      preview.ok.forEach((c) => {
        const clientId = "CLI-" + String(n++).padStart(4, "0");
        ops.push((b) => b.set(doc(collection(db, "contacts")), {
          ...c, clientId, clientType: c.clientType || "", relation: "nuevo", stage: "Lead", source: "Importado CSV",
          responsable: "", custom: {}, orgId, createdByEmail: me, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), importedAt: Date.now(),
        }));
      });
      // Existentes: solo se rellenan los datos vacíos (nunca se borra lo que ya hay).
      if (updateExisting) {
        updatable.forEach(({ c, prev }) => {
          const patch = {};
          for (const [k, v] of Object.entries(c)) {
            if (k === "email" || k === "whatsapp") continue;
            if (k === "tags") { const t = [...new Set([...(prev.tags || []), ...v])]; if (t.length !== (prev.tags || []).length) patch.tags = t; continue; }
            if (v && !prev[k]) patch[k] = v;
          }
          if (Object.keys(patch).length) ops.push((b) => b.update(doc(db, "contacts", prev.id), { ...patch, updatedAt: serverTimestamp() }));
        });
      }
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach((op) => op(batch));
        await batch.commit();
      }
      setResult(`Importados ${preview.ok.length} contacto(s)${updateExisting ? ` · ${ops.length - preview.ok.length} actualizado(s)` : ""}.`);
      setPreview(null);
    } catch (err) {
      setError("Error al importar: " + (err.code === "permission-denied" ? "tu rol no lo permite" : err.code || err.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CrmModal
      title="Importar contactos"
      onClose={onClose}
      maxWidth={660}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>{result ? "Cerrar" : "Cancelar"}</button>
          {preview && (
            <button className="crm-btn" onClick={doImport} disabled={busy || (!preview.ok.length && !(updateExisting && updatable.length))}>
              {busy ? "Importando…" : `Importar ${preview.ok.length}${updateExisting && updatable.length ? ` + actualizar ${updatable.length}` : ""}`}
            </button>
          )}
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Sube un <b>CSV</b> o <b>Excel</b> con una fila de cabeceras. Columnas reconocidas: Nombre, Apellidos, Email, Teléfono,
        Empresa, Cargo, DNI/NIF, Dirección, Ciudad, Provincia, Tipo de cliente, Etiquetas y Notas.
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
            <li><b>{preview.ok.length}</b> contactos nuevos se importarán</li>
            {preview.dupes.length > 0 && <li>{preview.dupes.length} ya existen o se repiten en el archivo (mismo email): no se duplican</li>}
            {preview.invalid.length > 0 && <li>{preview.invalid.length} sin nombre ni email válido: se omiten</li>}
            {preview.unknownTypes.length > 0 && (
              <li>Tipos de cliente que no están en la lista (quedan sin tipo): {preview.unknownTypes.slice(0, 8).join(", ")}{preview.unknownTypes.length > 8 ? "…" : ""}. Créalos en «Tipos de cliente» y vuelve a importar.</li>
            )}
            {!canSetType && preview.map.clientType && <li>La columna Tipo de cliente se ignora: solo los administradores pueden asignar tipos.</li>}
          </ul>
          {updatable.length > 0 && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13.5, cursor: "pointer" }}>
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              Completar los {updatable.length} que ya existen con los datos del archivo (solo campos vacíos; no se borra nada)
            </label>
          )}
        </div>
      )}
    </CrmModal>
  );
}
