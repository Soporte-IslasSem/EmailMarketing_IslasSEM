// Importar contactos desde CSV o Excel. Reconoce las columnas por nombre (es/en), muestra
// un resumen antes de importar y asigna el tipo de cliente si la columna coincide con uno.
// Para no duplicar, cada fila se busca entre los contactos que ya existen por, en este orden:
//   1) la columna ID (BX-…, CLI-…; viene en los archivos exportados desde Contactos),
//   2) el email,
//   3) nombre + teléfono (o + empresa) para las filas sin email.
// Con los que ya existen se puede: no tocarlos, completar solo sus campos vacíos o
// actualizarlos con lo que trae el archivo (una celda vacía nunca borra un dato).
import { useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import CrmModal from "./CrmModal";
import { typesOf, typeFields } from "../lib/clientTypes";

const FIELDS = {
  id: /^(id|id ?cliente|client ?id|c[oó]digo)$/i,
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
  id: "ID", firstName: "Nombre", lastName: "Apellidos", email: "Email", phone: "Teléfono", company: "Empresa", role: "Cargo",
  dni: "DNI/NIF", address: "Dirección", city: "Ciudad", province: "Provincia", clientType: "Tipo de cliente", tags: "Etiquetas", notes: "Notas",
};
const norm = (v) => String(v ?? "").trim();
const plain = (v) => norm(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const digits = (v) => String(v || "").replace(/\D/g, "").slice(-9);
const nameOf = (c) => plain(`${c.firstName || ""} ${c.lastName || ""}`).replace(/\s+/g, " ");
// Clave para reconocer a alguien sin email: nombre + teléfono, o nombre + empresa.
const personKeys = (c) => {
  const n = nameOf(c);
  if (!n) return [];
  return [digits(c.phone || c.whatsapp).length >= 9 ? `${n}|t${digits(c.phone || c.whatsapp)}` : "", plain(c.company) ? `${n}|e${plain(c.company)}` : ""].filter(Boolean);
};

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
  const [mode, setMode] = useState("none"); // con los que ya existen: none | fill | overwrite
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
      const byId = new Map(existing.filter((x) => x.clientId).map((x) => [norm(x.clientId).toUpperCase(), x]));
      // Nombre + teléfono/empresa: solo si identifica a UNA persona (si hay dos iguales, no se adivina).
      const byPerson = new Map();
      existing.forEach((x) => personKeys(x).forEach((k) => byPerson.set(k, byPerson.has(k) ? null : x)));
      const typeByName = new Map(types.flatMap((t) => [[plain(t.label), t.id], [plain(t.id), t.id]]));
      const seen = new Set();
      const ok = [], dupes = [], invalid = [], unknownTypes = new Set();
      const how = { id: 0, email: 0, person: 0 };
      rows.forEach((r) => {
        const get = (k) => (map[k] ? norm(r[map[k]]) : "");
        const email = get("email").toLowerCase();
        // Puede traer varios tipos separados por coma, punto y coma o barra.
        const typeIds = [];
        get("clientType").split(/[,;|]/).map(norm).filter(Boolean).forEach((raw) => {
          const id = typeByName.get(plain(raw));
          if (id) { if (!typeIds.includes(id)) typeIds.push(id); } else unknownTypes.add(raw);
        });
        const c = {
          firstName: get("firstName"), lastName: get("lastName"), email, phone: get("phone"), whatsapp: "",
          company: get("company"), role: get("role"), dni: get("dni"), address: get("address"), city: get("city"),
          province: get("province"), notes: get("notes"), tags: get("tags").split(/[,;]/).map(norm).filter(Boolean),
          ...(canSetType && typeIds.length ? { clientTypes: typeIds } : {}),
        };
        const rowId = get("id").toUpperCase();
        if (!c.firstName && !email && !rowId) return invalid.push(r);
        if (email && !EMAIL_RE.test(email)) return invalid.push(r);
        // ¿Ya existe? Por ID, por email o por nombre + teléfono/empresa.
        const keys = [rowId && `id:${rowId}`, email && `em:${email}`, ...personKeys(c).map((k) => `p:${k}`)].filter(Boolean);
        if (keys.some((k) => seen.has(k))) return dupes.push({ c, prev: null }); // repetida en el archivo
        keys.forEach((k) => seen.add(k));
        let prev = null;
        if (rowId && byId.has(rowId)) { prev = byId.get(rowId); how.id++; }
        else if (email && byEmail.has(email)) { prev = byEmail.get(email); how.email++; }
        else if (!email) {
          prev = personKeys(c).map((k) => byPerson.get(k)).find(Boolean) || null;
          if (prev) how.person++;
        }
        if (prev) return dupes.push({ c, prev });
        ok.push(c);
      });
      setPreview({ file: file.name, total: rows.length, map, ok, dupes, invalid, how, unknownTypes: [...unknownTypes] });
    } catch (err) {
      setError("No se pudo leer el archivo: " + (err.message || err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updatable = preview ? preview.dupes.filter((d) => d.prev) : [];
  // Lo que se cambiaría en cada contacto existente según el modo elegido.
  const patchFor = ({ c, prev }, how) => {
    const patch = {};
    for (const [k, v] of Object.entries(c)) {
      if (k === "whatsapp") continue;
      if (k === "email") {
        // Solo al reconocerlo por ID se puede cambiar su email (y si nadie más lo usa).
        if (how === "overwrite" && v && v !== String(prev.email || "").toLowerCase() && !existing.some((x) => x.id !== prev.id && String(x.email || "").toLowerCase() === v)) patch.email = v;
        continue;
      }
      if (k === "tags") {
        const t = how === "overwrite" && v.length ? v : [...new Set([...(prev.tags || []), ...v])];
        if (t.join("|") !== (prev.tags || []).join("|")) patch.tags = t;
        continue;
      }
      if (k === "clientTypes") {
        const t = how === "overwrite" ? v : [...new Set([...typesOf(prev), ...v])];
        if (t.join("|") !== typesOf(prev).join("|")) Object.assign(patch, typeFields(t));
        continue;
      }
      if (!v) continue; // una celda vacía nunca borra
      if (how === "overwrite" ? v !== norm(prev[k]) : !prev[k]) patch[k] = v;
    }
    return patch;
  };
  const changes = mode === "none" ? [] : updatable.map((d) => ({ id: d.prev.id, patch: patchFor(d, mode) })).filter((x) => Object.keys(x.patch).length);

  const doImport = async () => {
    setBusy(true); setError("");
    try {
      const me = String(auth.currentUser?.email || "").toLowerCase();
      const ops = [];
      let n = nextNumber;
      preview.ok.forEach((c) => {
        const clientId = "CLI-" + String(n++).padStart(4, "0");
        ops.push((b) => b.set(doc(collection(db, "contacts")), {
          ...c, clientId, ...typeFields(c.clientTypes), relation: "nuevo", stage: "Lead", source: "Importado CSV",
          responsable: "", custom: {}, orgId, createdByEmail: me, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), importedAt: Date.now(),
        }));
      });
      // Existentes: según el modo (nunca se borra un dato por una celda vacía).
      changes.forEach(({ id, patch }) => ops.push((b) => b.update(doc(db, "contacts", id), { ...patch, updatedAt: serverTimestamp() })));
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach((op) => op(batch));
        await batch.commit();
      }
      setResult(`Importados ${preview.ok.length} contacto(s) nuevo(s)${changes.length ? ` · ${changes.length} actualizado(s)` : ""}.`);
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
            <button className="crm-btn" onClick={doImport} disabled={busy || (!preview.ok.length && !changes.length)}>
              {busy ? "Importando…" : `Importar ${preview.ok.length}${changes.length ? ` + actualizar ${changes.length}` : ""}`}
            </button>
          )}
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Sube un <b>CSV</b> o <b>Excel</b> con una fila de cabeceras. Columnas reconocidas: ID, Nombre, Apellidos, Email, Teléfono,
        Empresa, Cargo, DNI/NIF, Dirección, Ciudad, Provincia, Tipo de cliente, Etiquetas y Notas. Para cambiar datos de
        contactos que ya existen, exporta desde Contactos, edita el archivo sin tocar la columna <b>ID</b> e impórtalo.
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
            {updatable.length > 0 && <li><b>{updatable.length}</b> ya existen (reconocidos por {[preview.how.id && `ID: ${preview.how.id}`, preview.how.email && `email: ${preview.how.email}`, preview.how.person && `nombre y teléfono/empresa: ${preview.how.person}`].filter(Boolean).join(", ")}): no se duplican</li>}
            {preview.dupes.length - updatable.length > 0 && <li>{preview.dupes.length - updatable.length} filas repetidas dentro del archivo: se omiten</li>}
            {preview.invalid.length > 0 && <li>{preview.invalid.length} sin nombre ni email válido: se omiten</li>}
            {preview.unknownTypes.length > 0 && (
              <li>Tipos de cliente que no están en la lista (quedan sin tipo): {preview.unknownTypes.slice(0, 8).join(", ")}{preview.unknownTypes.length > 8 ? "…" : ""}. Créalos en «Tipos de cliente» y vuelve a importar.</li>
            )}
            {!canSetType && preview.map.clientType && <li>La columna Tipo de cliente se ignora: solo los administradores pueden asignar tipos.</li>}
          </ul>
          {updatable.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 13.5 }}>
              <b>Con los {updatable.length} que ya existen:</b>
              {[
                ["none", "No tocarlos"],
                ["fill", "Completar solo sus campos vacíos"],
                ["overwrite", "Actualizarlos con lo que trae el archivo (cambia los datos distintos; una celda vacía no borra nada)"],
              ].map(([v, l]) => (
                <label key={v} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, cursor: "pointer" }}>
                  <input type="radio" name="import-mode" checked={mode === v} onChange={() => setMode(v)} style={{ width: "auto" }} /> {l}
                </label>
              ))}
              {mode !== "none" && <p style={{ margin: "6px 0 0", color: "var(--crm-muted)" }}>{changes.length ? `Se cambiarán datos en ${changes.length} contacto(s).` : "No hay nada que cambiar en los que ya existen."}</p>}
            </div>
          )}
        </div>
      )}
    </CrmModal>
  );
}
