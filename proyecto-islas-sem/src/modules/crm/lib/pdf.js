// Generación de PDF de presupuestos/cotizaciones y facturas (cliente, sin servidor).
// Usa pdfmake (ya instalado). El PDF es el que se adjuntará al correo cuando conectemos Resend.
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { money, fmtDate } from "./crm";

// Resuelve el "virtual file system" de fuentes de pdfmake.
// En 0.3.x `vfs_fonts` exporta el objeto vfs directamente (module.exports = vfs);
// en versiones previas venía como { pdfMake: { vfs } } o { vfs }. Cubrimos ambos.
(function ensureVfs() {
  try {
    const m = pdfFonts;
    const vfs = m?.pdfMake?.vfs || m?.vfs || m?.default?.vfs || m?.default || m;
    if (vfs && typeof vfs === "object") pdfMake.vfs = vfs;
  } catch (e) {
    console.warn("[pdf] no se pudo cargar el vfs de fuentes:", e);
  }
})();

const TEAL = "#136B68";
const GOLD = "#E2B83C";

// Construye la definición del documento a partir de un doc (quote/invoice) del CRM.
function buildDoc(doc, { isInvoice }) {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const subtotal =
    doc.subtotal != null
      ? Number(doc.subtotal)
      : items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const total = doc.amount != null ? Number(doc.amount) : subtotal * 1.21;
  const iva = total - subtotal;

  const body = [
    [
      { text: "Producto / concepto", style: "th" },
      { text: "Precio", style: "th", alignment: "right" },
      { text: "Cant.", style: "th", alignment: "right" },
      { text: "Importe", style: "th", alignment: "right" },
    ],
  ];
  if (items.length) {
    items.forEach((it) => {
      const imp = (Number(it.price) || 0) * (Number(it.qty) || 0);
      body.push([
        it.name || "—",
        { text: money(it.price), alignment: "right" },
        { text: String(it.qty || 1), alignment: "right" },
        { text: money(imp), alignment: "right" },
      ]);
    });
  } else {
    body.push([doc.concept || "Servicio", { text: money(subtotal), alignment: "right" }, { text: "1", alignment: "right" }, { text: money(subtotal), alignment: "right" }]);
  }

  return {
    pageSize: "A4",
    pageMargins: [40, 70, 40, 60],
    header: {
      margin: [40, 24, 40, 0],
      columns: [
        { text: "ISLAS SEM", style: "brand" },
        { text: isInvoice ? "FACTURA" : "PRESUPUESTO", style: "doctype", alignment: "right" },
      ],
    },
    footer: (cur, total) => ({
      margin: [40, 0, 40, 20],
      columns: [
        { text: "ISLAS SEM SLU · Canarias · www.islassem.com", style: "foot" },
        { text: `Página ${cur} de ${total}`, style: "foot", alignment: "right" },
      ],
    }),
    content: [
      {
        columns: [
          [
            { text: `Nº ${doc.number || "—"}`, style: "docnum" },
            { text: `Fecha: ${fmtDate(doc.createdAt) || new Date().toLocaleDateString("es-ES")}`, style: "muted" },
            { text: `Estado: ${doc.status || "—"}`, style: "muted" },
          ],
          [
            { text: "Cliente", style: "label", alignment: "right" },
            { text: doc.client || "—", style: "client", alignment: "right" },
            { text: doc.concept || "", style: "muted", alignment: "right" },
          ],
        ],
        columnGap: 20,
        margin: [0, 10, 0, 18],
      },
      {
        table: { headerRows: 1, widths: ["*", "auto", "auto", "auto"], body },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? TEAL : rowIndex % 2 === 0 ? "#f3f7f7" : null),
          hLineColor: "#dbe6e6",
          vLineColor: "#dbe6e6",
        },
      },
      {
        margin: [0, 16, 0, 0],
        columns: [
          { text: "", width: "*" },
          {
            width: "auto",
            table: {
              body: [
                [{ text: "Subtotal", style: "totlabel" }, { text: money(subtotal), style: "totval", alignment: "right" }],
                [{ text: "IVA (21%)", style: "totlabel" }, { text: money(iva), style: "totval", alignment: "right" }],
                [{ text: "TOTAL", style: "totlabelb" }, { text: money(total), style: "totvalb", alignment: "right" }],
              ],
            },
            layout: "noBorders",
          },
        ],
      },
      doc.notes ? { text: doc.notes, style: "muted", margin: [0, 22, 0, 0] } : {},
      {
        text: isInvoice
          ? "Gracias por su confianza. Pago según condiciones acordadas."
          : "Presupuesto válido durante 30 días desde la fecha de emisión.",
        style: "note",
        margin: [0, 26, 0, 0],
      },
    ],
    styles: {
      brand: { fontSize: 18, bold: true, color: TEAL },
      doctype: { fontSize: 16, bold: true, color: GOLD },
      docnum: { fontSize: 14, bold: true, color: "#1f2d2d" },
      label: { fontSize: 9, color: "#7a8a8a", bold: true },
      client: { fontSize: 13, bold: true, color: "#1f2d2d" },
      muted: { fontSize: 10, color: "#6b7d7d" },
      th: { color: "#ffffff", bold: true, fontSize: 10, margin: [0, 3, 0, 3] },
      totlabel: { fontSize: 10, color: "#6b7d7d", margin: [0, 2, 12, 2] },
      totval: { fontSize: 10, color: "#1f2d2d", margin: [0, 2, 0, 2] },
      totlabelb: { fontSize: 12, bold: true, color: TEAL, margin: [0, 4, 12, 0] },
      totvalb: { fontSize: 12, bold: true, color: TEAL, margin: [0, 4, 0, 0] },
      note: { fontSize: 9, italics: true, color: "#8a9a9a" },
      foot: { fontSize: 8, color: "#9aa8a8" },
    },
    defaultStyle: { fontSize: 10, color: "#2a3a3a" },
  };
}

function safeName(doc, isInvoice) {
  const base = `${isInvoice ? "Factura" : "Presupuesto"}_${doc.number || "SN"}_${(doc.client || "cliente").replace(/[^\w\-]+/g, "-")}`;
  return base.slice(0, 80) + ".pdf";
}

// Descarga el PDF del documento.
export function downloadDocPDF(doc, { isInvoice = false } = {}) {
  pdfMake.createPdf(buildDoc(doc, { isInvoice })).download(safeName(doc, isInvoice));
}
// Abre el PDF en una pestaña nueva (previsualizar).
export function openDocPDF(doc, { isInvoice = false } = {}) {
  pdfMake.createPdf(buildDoc(doc, { isInvoice })).open();
}
