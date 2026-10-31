// Editar una plantilla como en Word: bloques ⇄ HTML editable, y bloques → .docx para descargarla.
// Bloques: [{ t: "h"|"p"|"li"|"table", runs:[{text,b,i,u}], level, align, ordered, rows:[[runs]] }]
// (el mismo formato que sale de un .docx subido y que usan el envío, la firma y el PDF).
import JSZip from "jszip";
import { mergeRuns } from "./docx";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const HOLE_SPLIT = /(\[[^[\]]{1,120}\])/;
const IS_HOLE = /^\[[^[\]]{1,120}\]$/;
const ALIGNS = ["center", "right", "justify"];
const NBSP = new RegExp(String.fromCharCode(160), "g"); // espacio duro
const EMSP = new RegExp(String.fromCharCode(8195), "g"); // tabulador pintado como &emsp;

/* ------------------------------------------------------------------ bloques → HTML */

function runsHtml(runs) {
  return (runs || []).map((r) => {
    let h = String(r.text).split(HOLE_SPLIT).map((p) => (IS_HOLE.test(p) ? `<mark class="doc-hole">${esc(p)}</mark>` : esc(p).replace(/\n/g, "<br>").replace(/\t/g, "&emsp;"))).join("");
    if (r.u) h = `<u>${h}</u>`;
    if (r.i) h = `<i>${h}</i>`;
    if (r.b) h = `<b>${h}</b>`;
    return h;
  }).join("") || "<br>";
}
const alignAttr = (b) => (ALIGNS.includes(b.align) ? ` style="text-align:${b.align}"` : "");

export function blocksToHtml(blocks) {
  const out = [];
  let list = null; // lista abierta: "ul" | "ol"
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const b of blocks || []) {
    if (b.t === "li") {
      const tag = b.ordered ? "ol" : "ul";
      if (list !== tag) { close(); out.push(`<${tag}>`); list = tag; }
      out.push(`<li>${runsHtml(b.runs)}</li>`);
      continue;
    }
    close();
    if (b.t === "h") { const n = Math.min(3, Math.max(1, Number(b.level) || 1)); out.push(`<h${n}${alignAttr(b)}>${runsHtml(b.runs)}</h${n}>`); }
    else if (b.t === "table") out.push(`<table><tbody>${(b.rows || []).map((row) => `<tr>${row.map((cell) => `<td>${runsHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    else out.push(`<p${alignAttr(b)}>${runsHtml(b.runs)}</p>`);
  }
  close();
  return out.join("") || "<p><br></p>";
}

/* ------------------------------------------------------------------ HTML → bloques */

const isBold = (el) => /^(B|STRONG)$/.test(el.tagName) || /^(bold|[6-9]00)$/.test(el.style?.fontWeight || "");
const isItalic = (el) => /^(I|EM)$/.test(el.tagName) || el.style?.fontStyle === "italic";
const isUnder = (el) => el.tagName === "U" || /underline/.test(el.style?.textDecoration || el.style?.textDecorationLine || "");

// Texto con formato de un nodo (los <br> pasan a salto de línea dentro del mismo bloque).
function inlineRuns(node, fmt = {}) {
  const runs = [];
  for (const c of node.childNodes) {
    if (c.nodeType === 3) {
      const text = c.nodeValue.replace(NBSP, " ").replace(EMSP, "\t");
      if (text) runs.push({ text, ...fmt });
    } else if (c.nodeType === 1) {
      if (c.tagName === "BR") { runs.push({ text: "\n", ...fmt }); continue; }
      if (/^(UL|OL|TABLE|SCRIPT|STYLE)$/.test(c.tagName)) continue;
      runs.push(...inlineRuns(c, { b: fmt.b || isBold(c), i: fmt.i || isItalic(c), u: fmt.u || isUnder(c) }));
    }
  }
  return runs;
}
// Limpia: sin saltos sobrantes al final (el <br> de relleno de un párrafo vacío) y huecos enteros.
function tidy(runs) {
  const r = mergeRuns(runs.map((x) => ({ ...x })));
  while (r.length && /\n$/.test(r[r.length - 1].text)) {
    r[r.length - 1].text = r[r.length - 1].text.replace(/\n+$/, "");
    if (!r[r.length - 1].text) r.pop();
  }
  return r.filter((x) => x.text);
}
const hasText = (runs) => runs.some((r) => r.text.trim());
const alignOf = (el) => {
  const a = (el.style?.textAlign || el.getAttribute?.("align") || "").toLowerCase();
  return ALIGNS.includes(a) ? a : undefined;
};

export function htmlToBlocks(root) {
  const blocks = [];
  let loose = []; // texto suelto en la raíz (sin párrafo)
  const flushLoose = () => { const runs = tidy(loose); if (hasText(runs)) blocks.push({ t: "p", runs }); loose = []; };
  const para = (el, t, extra = {}) => {
    const runs = tidy(inlineRuns(el));
    if (hasText(runs)) blocks.push({ t, runs, ...extra, ...(alignOf(el) && t !== "li" ? { align: alignOf(el) } : {}) });
  };
  const walk = (parent) => {
    for (const c of parent.childNodes) {
      if (c.nodeType === 3) { loose.push({ text: c.nodeValue.replace(NBSP, " ") }); continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.tagName;
      if (/^(B|STRONG|I|EM|U|SPAN|MARK|A|FONT)$/.test(tag)) { loose.push(...inlineRuns({ childNodes: [c] })); continue; }
      if (tag === "BR") { flushLoose(); continue; }
      flushLoose();
      if (/^H[1-6]$/.test(tag)) para(c, "h", { level: Math.min(3, Number(tag[1])) });
      else if (tag === "UL" || tag === "OL") {
        for (const li of c.querySelectorAll(":scope > li")) {
          para(li, "li", tag === "OL" ? { ordered: true } : {});
          for (const sub of li.querySelectorAll(":scope > ul, :scope > ol")) walk({ childNodes: [sub] });
        }
      } else if (tag === "TABLE") {
        const rows = [...c.querySelectorAll("tr")].map((tr) => [...tr.children].filter((td) => /^T[DH]$/.test(td.tagName)).map((td) => tidy(inlineRuns(td))));
        if (rows.some((r) => r.some(hasText))) blocks.push({ t: "table", rows });
      } else if (tag === "DIV" && [...c.children].some((x) => /^(P|DIV|H[1-6]|UL|OL|TABLE)$/.test(x.tagName))) walk(c);
      else para(c, "p");
    }
    flushLoose();
  };
  walk(root);
  return blocks;
}

/* ------------------------------------------------------------------ bloques → .docx */

const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const JC = { center: "center", right: "right", justify: "both" };

function runXml(r, size) {
  const pr = [r.b ? "<w:b/>" : "", r.i ? "<w:i/>" : "", r.u ? '<w:u w:val="single"/>' : "", size ? `<w:sz w:val="${size}"/>` : ""].join("");
  return String(r.text).split("\n").map((line, i) => {
    const parts = line.split("\t").map((t, j) => `${j ? "<w:tab/>" : ""}<w:t xml:space="preserve">${xmlEsc(t)}</w:t>`).join("");
    return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}${i ? "<w:br/>" : ""}${parts}</w:r>`;
  }).join("");
}
function paraXml(runs, { style, align, size } = {}) {
  const ppr = [style ? `<w:pStyle w:val="${style}"/>` : "", JC[align] ? `<w:jc w:val="${JC[align]}"/>` : ""].join("");
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${(runs || []).map((r) => runXml(r, size)).join("")}</w:p>`;
}

export async function blocksToDocx(blocks) {
  const body = (blocks || []).map((b) => {
    if (b.t === "h") return paraXml(b.runs, { style: `Heading${Math.min(3, Number(b.level) || 1)}`, align: b.align });
    if (b.t === "li") return paraXml(b.runs, { style: "ListParagraph" }).replace("<w:pPr>", `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${b.ordered ? 2 : 1}"/></w:numPr>`);
    if (b.t === "table") {
      const border = '<w:tblBorders>' + ["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`).join("") + "</w:tblBorders>";
      return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${border}</w:tblPr>${(b.rows || []).map((row) => `<w:tr>${row.map((cell) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${paraXml(cell)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl><w:p/>`;
    }
    return paraXml(b.runs, { align: b.align || "justify" });
  }).join("");
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const heading = (n, size) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="136B68"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>');
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${heading(1, 32)}${heading(2, 26)}${heading(3, 23)}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style></w:styles>`);
  const lvl = (fmt, text) => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>`;
  zip.file("word/numbering.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0">${lvl("bullet", "•")}</w:abstractNum><w:abstractNum w:abstractNumId="1">${lvl("decimal", "%1.")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export async function downloadDocx(blocks, name) {
  const blob = await blocksToDocx(blocks);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${String(name || "plantilla").replace(/[\\/:*?"<>|]/g, " ").trim() || "plantilla"}.docx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
