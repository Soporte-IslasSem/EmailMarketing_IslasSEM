// Exportar una lista a CSV (se abre bien en Excel: separador ";" y BOM UTF-8).
// columns: [[cabecera, (fila) => valor], ...]
export function exportCsv(filename, rows, columns) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(([h]) => cell(h)).join(";"), ...rows.map((r) => columns.map(([, f]) => cell(f(r))).join(";"))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
