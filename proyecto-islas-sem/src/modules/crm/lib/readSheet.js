// Leer un CSV o Excel subido por el usuario → filas como objetos { cabecera: valor }.
// Excel en español guarda los CSV como "ANSI" (Windows-1252), no UTF-8: si el texto no es UTF-8
// válido se lee como Windows-1252 (si no, "Teléfono" llegaría como "Tel?fono" y los acentos rotos).
import Papa from "papaparse";
import * as XLSX from "xlsx";

const BOM = /^\uFEFF/;

async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

export async function readFile(file) {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    const wb = XLSX.read(await file.arrayBuffer());
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
  }
  const text = (await readText(file)).replace(BOM, "");
  return new Promise((resolve, reject) =>
    Papa.parse(text, {
      header: true, skipEmptyLines: "greedy",
      transformHeader: (h) => String(h).replace(BOM, "").trim(),
      complete: (r) => resolve(r.data), error: reject,
    })
  );
}
