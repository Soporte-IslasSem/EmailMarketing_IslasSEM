// Genera el PDF de una cotización/factura en el servidor (para adjuntarlo al correo).
// Mismo diseño que el PDF del frontend, en Node con pdfmake 0.3.x.
const PdfPrinter = require("pdfmake"); // 0.2.x: el módulo ES el constructor

// vfs de fuentes (objeto filename -> base64).
const rawVfs = require("pdfmake/build/vfs_fonts.js");
const vfs = rawVfs.pdfMake?.vfs || rawVfs.vfs || rawVfs;

const fonts = {
  Roboto: {
    normal: Buffer.from(vfs["Roboto-Regular.ttf"], "base64"),
    bold: Buffer.from(vfs["Roboto-Medium.ttf"], "base64"),
    italics: Buffer.from(vfs["Roboto-Italic.ttf"], "base64"),
    bolditalics: Buffer.from(vfs["Roboto-MediumItalic.ttf"], "base64"),
  },
};

let printer;
const getPrinter = () => (printer = printer || new PdfPrinter(fonts));

const money = (n) => "€" + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TEAL = "#136B68", GOLD = "#E2B83C";

function buildDoc(doc, isInvoice) {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const subtotal = doc.subtotal != null ? Number(doc.subtotal) : items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const total = doc.amount != null ? Number(doc.amount) : subtotal * 1.21;
  const iva = total - subtotal;
  const body = [[
    { text: "Producto / concepto", style: "th" },
    { text: "Precio", style: "th", alignment: "right" },
    { text: "Cant.", style: "th", alignment: "right" },
    { text: "Importe", style: "th", alignment: "right" },
  ]];
  if (items.length) items.forEach((it) => body.push([
    it.name || "—",
    { text: money(it.price), alignment: "right" },
    { text: String(it.qty || 1), alignment: "right" },
    { text: money((Number(it.price) || 0) * (Number(it.qty) || 0)), alignment: "right" },
  ]));
  else body.push([doc.concept || "Servicio", { text: money(subtotal), alignment: "right" }, { text: "1", alignment: "right" }, { text: money(subtotal), alignment: "right" }]);

  return {
    pageSize: "A4",
    pageMargins: [40, 60, 40, 50],
    content: [
      { columns: [{ text: "ISLAS SEM", style: "brand" }, { text: isInvoice ? "FACTURA" : "PRESUPUESTO", style: "doctype", alignment: "right" }] },
      { columns: [
        [{ text: `Nº ${doc.number || "—"}`, style: "docnum" }, { text: `Estado: ${doc.status || "—"}`, style: "muted" }],
        [{ text: "Cliente", style: "label", alignment: "right" }, { text: doc.client || "—", style: "client", alignment: "right" }, { text: doc.concept || "", style: "muted", alignment: "right" }],
      ], margin: [0, 14, 0, 16] },
      { table: { headerRows: 1, widths: ["*", "auto", "auto", "auto"], body }, layout: { fillColor: (r) => (r === 0 ? TEAL : r % 2 === 0 ? "#f3f7f7" : null), hLineColor: "#dbe6e6", vLineColor: "#dbe6e6" } },
      { margin: [0, 16, 0, 0], columns: [{ text: "", width: "*" }, { width: "auto", table: { body: [
        [{ text: "Subtotal", style: "totlabel" }, { text: money(subtotal), alignment: "right" }],
        [{ text: "IVA (21%)", style: "totlabel" }, { text: money(iva), alignment: "right" }],
        [{ text: "TOTAL", style: "totlabelb" }, { text: money(total), style: "totvalb", alignment: "right" }],
      ] }, layout: "noBorders" }] },
      { text: isInvoice ? "Gracias por su confianza." : "Presupuesto válido durante 30 días.", style: "note", margin: [0, 24, 0, 0] },
    ],
    styles: {
      brand: { fontSize: 18, bold: true, color: TEAL },
      doctype: { fontSize: 16, bold: true, color: GOLD },
      docnum: { fontSize: 14, bold: true },
      label: { fontSize: 9, color: "#7a8a8a", bold: true },
      client: { fontSize: 13, bold: true },
      muted: { fontSize: 10, color: "#6b7d7d" },
      th: { color: "#fff", bold: true, fontSize: 10, margin: [0, 3, 0, 3] },
      totlabel: { fontSize: 10, color: "#6b7d7d", margin: [0, 2, 12, 2] },
      totlabelb: { fontSize: 12, bold: true, color: TEAL, margin: [0, 4, 12, 0] },
      totvalb: { fontSize: 12, bold: true, color: TEAL },
      note: { fontSize: 9, italics: true, color: "#8a9a9a" },
    },
    defaultStyle: { fontSize: 10, color: "#2a3a3a" },
  };
}

// Devuelve el PDF como Buffer.
function renderDocPDF(doc, { isInvoice = false } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = getPrinter().createPdfKitDocument(buildDoc(doc, isInvoice));
      const chunks = [];
      pdfDoc.on("data", (c) => chunks.push(c));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { renderDocPDF };
