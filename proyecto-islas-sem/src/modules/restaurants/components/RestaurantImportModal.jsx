// Importar restaurantes desde CSV o Excel (las mismas columnas que "Exportar").
// Cada fila se busca entre las fichas que ya existen por la columna ID (viene en el archivo
// exportado) o, si no hay ID, por nombre + ciudad. Con las que ya existen se puede no tocarlas,
// completar solo sus campos vacíos o actualizarlas (una celda vacía nunca borra un dato).
import { useRef, useState } from "react";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import CrmModal from "../../crm/components/CrmModal";
import { readFile } from "../../crm/lib/readSheet";
import { COLLECTION, EMPTY, CSV_COLUMNS } from "../lib/restaurants";

const norm = (v) => String(v ?? "").trim();
const plain = (v) => norm(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
const ALIASES = { name: ["nombre", "restaurante", "nombre del restaurante"], email: ["email", "e-mail", "correo", "email de contacto"], website: ["web", "pagina web", "sitio web", "website"] };
const keyOf = (r) => `${plain(r.name)}|${plain(r.city)}`;
const toBool = (v) => /^(on|si|sí|s|yes|y|1|true|x)$/i.test(norm(v));

function mapColumns(headers) {
  const map = {};
  headers.forEach((h) => {
    const p = plain(h);
    const col = CSV_COLUMNS.find(([k, label]) => plain(label) === p || plain(k) === p || (ALIASES[k] || []).includes(p));
    if (col && !map[col[0]]) map[col[0]] = h;
  });
  return map;
}

export default function RestaurantImportModal({ orgId, existing, onClose }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState("none");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setResult(""); setPreview(null);
    try {
      const rows = await readFile(file);
      if (!rows.length) return setError("El archivo está vacío.");
      const map = mapColumns(Object.keys(rows[0]));
      if (!map.name && !map.id) return setError("No encuentro la columna «Restaurante» (nombre). Revisa la primera fila (cabeceras).");
      const byId = new Map(existing.map((r) => [r.id, r]));
      const byKey = new Map();
      existing.forEach((r) => { const k = keyOf(r); byKey.set(k, byKey.has(k) ? null : r); });
      const seen = new Set();
      const ok = [], dupes = [], invalid = [];
      rows.forEach((row) => {
        const data = {};
        for (const [k] of CSV_COLUMNS) {
          if (k === "id" || !map[k]) continue;
          const v = norm(row[map[k]]);
          if (!v) continue;
          data[k] = k === "birthdayAutomation" ? toBool(v) : v;
        }
        if (data.email) data.email = data.email.toLowerCase();
        const id = map.id ? norm(row[map.id]) : "";
        if (!data.name && !id) return invalid.push(row);
        const k = id ? `id:${id}` : `k:${keyOf(data)}`;
        if (seen.has(k)) return dupes.push({ data, prev: null });
        seen.add(k);
        const prev = (id && byId.get(id)) || (data.name ? byKey.get(keyOf(data)) : null) || null;
        if (prev) return dupes.push({ data, prev });
        if (!data.name) return invalid.push(row);
        ok.push(data);
      });
      setPreview({ file: file.name, total: rows.length, map, ok, dupes, invalid });
      setMode(map.id && dupes.some((d) => d.prev) ? "overwrite" : "none");
    } catch (err) {
      setError("No se pudo leer el archivo: " + (err.message || err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updatable = preview ? preview.dupes.filter((d) => d.prev) : [];
  const patchFor = ({ data, prev }, how) => {
    const patch = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "birthdayAutomation") { if (how === "overwrite" && v !== !!prev[k]) patch[k] = v; continue; }
      const cur = norm(prev[k]);
      if (how === "overwrite" ? v !== cur : !cur) patch[k] = v;
    }
    return patch;
  };
  const changes = mode === "none" ? [] : updatable.map((d) => ({ id: d.prev.id, patch: patchFor(d, mode) })).filter((x) => Object.keys(x.patch).length);

  const doImport = async () => {
    setBusy(true); setError("");
    try {
      const me = String(auth.currentUser?.email || "").toLowerCase();
      const ops = [];
      preview.ok.forEach((data) => ops.push((b) => b.set(doc(collection(db, COLLECTION)), {
        ...EMPTY, ...data, orgId, createdByEmail: me, source: "Importado CSV", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })));
      changes.forEach(({ id, patch }) => ops.push((b) => b.update(doc(db, COLLECTION, id), { ...patch, updatedAt: serverTimestamp() })));
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach((op) => op(batch));
        await batch.commit();
      }
      setResult(`Importados ${preview.ok.length} restaurante(s) nuevo(s)${changes.length ? ` · ${changes.length} actualizado(s)` : ""}.`);
      setPreview(null);
    } catch (err) {
      setError("Error al importar: " + (err.code === "permission-denied" ? "tu rol no lo permite" : err.code || err.message));
    } finally {
      setBusy(false);
    }
  };

  const label = Object.fromEntries(CSV_COLUMNS);
  return (
    <CrmModal
      title="Importar restaurantes"
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
        Sube un <b>CSV</b> o <b>Excel</b> con una fila de cabeceras: las mismas columnas que salen al <b>Exportar</b>
        (Restaurante, Ciudad, Email de contacto, Web, teléfonos, redes…). Lo más cómodo: exporta, rellena o corrige el archivo
        sin tocar la columna <b>ID</b> e impórtalo. Las filas sin ID se dan de alta como restaurantes nuevos (o se reconocen por nombre + ciudad).
      </p>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" onChange={onFile} />
      {error && <p style={{ color: "#b0304c", fontSize: 13 }}>{error}</p>}
      {result && <p style={{ color: "#136B68", fontWeight: 600 }}>{result}</p>}
      {preview && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 6px" }}><b>{preview.file}</b> · {preview.total} fila(s)</p>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--crm-muted)" }}>
            Columnas detectadas: {Object.entries(preview.map).map(([k, h]) => `${label[k]} ← "${h}"`).join(" · ") || "ninguna"}
          </p>
          <ul style={{ margin: "6px 0 0" }}>
            <li><b>{preview.ok.length}</b> restaurantes nuevos se darán de alta</li>
            {updatable.length > 0 && <li><b>{updatable.length}</b> ya existen: no se duplican</li>}
            {preview.dupes.length - updatable.length > 0 && <li>{preview.dupes.length - updatable.length} filas repetidas dentro del archivo: se omiten</li>}
            {preview.invalid.length > 0 && <li>{preview.invalid.length} filas sin nombre: se omiten</li>}
          </ul>
          {updatable.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 13.5 }}>
              <b>Con los {updatable.length} que ya existen:</b>
              {[
                ["none", "No tocarlos"],
                ["fill", "Completar solo sus campos vacíos"],
                ["overwrite", "Actualizarlos con lo que trae el archivo (una celda vacía no borra nada)"],
              ].map(([v, l]) => (
                <label key={v} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, cursor: "pointer" }}>
                  <input type="radio" name="rimport-mode" checked={mode === v} onChange={() => setMode(v)} style={{ width: "auto" }} /> {l}
                </label>
              ))}
              {mode !== "none" && <p style={{ margin: "6px 0 0", color: "var(--crm-muted)" }}>{changes.length ? `Se cambiarán datos en ${changes.length} restaurante(s).` : "No hay nada que cambiar: el archivo trae los mismos datos."}</p>}
              {mode === "none" && <p style={{ margin: "6px 0 0", color: "#b26b00" }}>⚠ Con «No tocarlos» no se guarda ningún cambio en estos restaurantes. Si has editado el archivo, elige «Actualizarlos».</p>}
            </div>
          )}
        </div>
      )}
    </CrmModal>
  );
}
