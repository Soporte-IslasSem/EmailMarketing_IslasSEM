// .DOCX → bloques de texto para los contratos (títulos, párrafos con negrita/cursiva, listas y
// tablas). Lee word/document.xml con un analizador XML mínimo, así funciona igual en el navegador
// y en Node (pruebas). Los huecos [..] que Word parte en varios trozos se vuelven a unir.
import JSZip from "jszip";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m);

// XML → árbol { name, attrs, children: [nodo | texto] }
function parseXml(xml) {
  const root = { name: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[6] != null) { top.children.push(decode(m[6])); continue; }
    if (m[5] != null) { top.children.push(m[5]); continue; }
    if (!m[2]) continue; // declaración o comentario
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    for (const a of (m[3] || "").matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? "");
    const node = { name: m[2], attrs, children: [] };
    top.children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
}
const kids = (n, name) => (n?.children || []).filter((c) => typeof c === "object" && (!name || c.name === name));
const first = (n, name) => kids(n, name)[0];
const on = (n) => !!n && !["0", "false", "off"].includes(String(n.attrs["w:val"] ?? "").toLowerCase());

function runsOfParagraph(p) {
  const runs = [];
  const walk = (node) => {
    for (const c of kids(node)) {
      if (c.name === "w:r") {
        const pr = first(c, "w:rPr");
        const fmt = { b: on(first(pr, "w:b")), i: on(first(pr, "w:i")), u: !!first(pr, "w:u") && first(pr, "w:u").attrs["w:val"] !== "none" };
        let text = "";
        for (const x of kids(c)) {
          if (x.name === "w:t") text += x.children.filter((t) => typeof t === "string").join("");
          else if (x.name === "w:tab") text += "\t";
          else if (x.name === "w:br" || x.name === "w:cr") text += "\n";
          else if (x.name === "w:noBreakHyphen") text += "-";
        }
        if (text) runs.push({ text, ...fmt });
      } else if (["w:hyperlink", "w:smartTag", "w:ins", "w:sdt", "w:sdtContent", "w:fldSimple"].includes(c.name)) walk(c);
    }
  };
  walk(p);
  return mergeRuns(runs);
}

// Une trozos con el mismo formato y los huecos [..] partidos en varios trozos.
function mergeRuns(runs) {
  const same = (a, b) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u;
  let out = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && same(last, r)) last.text += r.text; else out.push({ ...r });
  }
  const full = out.map((r) => r.text).join("");
  const spans = [...full.matchAll(/\[[^[\]]{1,120}\]/g)].map((m) => [m.index, m.index + m[0].length]);
  if (!spans.length) return out.map(clean);
  // Para cada hueco que cruza trozos, todo el hueco pasa al trozo donde empieza.
  let pos = 0;
  const bounds = out.map((r) => { const b = [pos, pos + r.text.length]; pos += r.text.length; return b; });
  const merged = [];
  let i = 0;
  while (i < out.length) {
    let [start, end] = bounds[i];
    let text = out[i].text;
    let j = i;
    for (const [s, e] of spans) {
      if (s >= start && s < end && e > end) {
        while (j + 1 < out.length && bounds[j][1] < e) { j++; text += out[j].text; end = bounds[j][1]; }
      }
    }
    merged.push({ ...out[i], text });
    i = j + 1;
  }
  return merged.map(clean);
}
const clean = (r) => ({ text: r.text, ...(r.b ? { b: true } : {}), ...(r.i ? { i: true } : {}), ...(r.u ? { u: true } : {}) });

function paragraphBlock(p) {
  const pr = first(p, "w:pPr");
  const style = String(first(pr, "w:pStyle")?.attrs["w:val"] || "");
  const jc = String(first(pr, "w:jc")?.attrs["w:val"] || "");
  const runs = runsOfParagraph(p);
  if (!runs.map((r) => r.text).join("").trim()) return null;
  const align = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : jc === "both" ? "justify" : undefined;
  const h = /^(heading|ttulo|titulo|title)(\d?)$/i.exec(style.replace(/[^a-z0-9]/gi, ""));
  if (h) return { t: "h", level: /title/i.test(h[1]) ? 1 : Math.min(3, Number(h[2]) || 1), runs, ...(align ? { align } : {}) };
  if (first(pr, "w:numPr") || /list|lista|vi[ñn]eta/i.test(style)) return { t: "li", runs };
  return { t: "p", runs, ...(align ? { align } : {}) };
}

function tableBlock(tbl) {
  const rows = kids(tbl, "w:tr").map((tr) => kids(tr, "w:tc").map((tc) => {
    const parts = [];
    for (const p of kids(tc, "w:p")) {
      const runs = runsOfParagraph(p);
      if (!runs.length) continue;
      if (parts.length) parts.push({ text: "\n" });
      parts.push(...runs);
    }
    return parts;
  }));
  return rows.length ? { t: "table", rows } : null;
}

export function blocksFromDocumentXml(xml) {
  const body = first(first(parseXml(xml), "w:document"), "w:body");
  const blocks = [];
  const walk = (node) => {
    for (const c of kids(node)) {
      if (c.name === "w:p") { const b = paragraphBlock(c); if (b) blocks.push(b); }
      else if (c.name === "w:tbl") { const b = tableBlock(c); if (b) blocks.push(b); }
      else if (c.name === "w:sdt" || c.name === "w:sdtContent") walk(c);
    }
  };
  walk(body);
  return blocks;
}

export async function blocksFromDocx(fileOrBuffer) {
  const zip = await JSZip.loadAsync(fileOrBuffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("No parece un documento de Word (.docx)");
  return blocksFromDocumentXml(xml);
}

const allText = (blocks) => (blocks || []).map((b) => (b.t === "table" ? b.rows.flat().flat().map((r) => r.text).join(" ") : b.runs.map((r) => r.text).join(""))).join("\n");
// Huecos [..] del documento, en orden de aparición y sin repetir.
export function holesOf(blocks) {
  return [...new Set([...allText(blocks).matchAll(/\[[^[\]]{1,120}\]/g)].map((m) => m[0]))];
}
// Cuántas veces aparece cada hueco (si aparece más de una, tendrá el mismo valor en todas).
export function holeCounts(blocks) {
  const out = {};
  for (const m of allText(blocks).matchAll(/\[[^[\]]{1,120}\]/g)) out[m[0]] = (out[m[0]] || 0) + 1;
  return out;
}

// Origen propuesto para cada hueco según sus palabras (el admin lo confirma o lo cambia).
export const SOURCE_LABELS = [
  ["contact.fullName", "Cliente · nombre completo"], ["contact.firstName", "Cliente · nombre"], ["contact.lastName", "Cliente · apellidos"],
  ["contact.dni", "Cliente · DNI / NIF"], ["contact.email", "Cliente · email"], ["contact.phone", "Cliente · teléfono"],
  ["contact.address", "Cliente · dirección"], ["contact.city", "Cliente · ciudad"], ["contact.province", "Cliente · provincia"],
  ["company.name", "Empresa del cliente · nombre"], ["company.cif", "Empresa del cliente · CIF"], ["company.address", "Empresa del cliente · dirección"],
  ["deal.amount", "Negociación · importe"], ["deal.title", "Negociación · título"],
  ["org.name", "ISLAS SEM · razón social"], ["org.cif", "ISLAS SEM · CIF"], ["org.address", "ISLAS SEM · domicilio"],
  ["org.signerName", "ISLAS SEM · firmante"], ["org.signerDni", "ISLAS SEM · DNI del firmante"], ["org.signerRole", "ISLAS SEM · cargo del firmante"],
  ["date.today", "Fecha de hoy"], ["form", "Campo de un formulario…"], ["fixed", "Valor fijo…"], ["ask", "Preguntar al enviar"],
];
export function guessSource(hole) {
  const k = hole.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const prov = /prestador|agencia|profesional|islas|proveedor|empresa contratista/.test(k);
  if (/fecha|dia de hoy/.test(k)) return "date.today";
  if (/monto|importe|precio|honorario|cantidad|total|euros/.test(k)) return "deal.amount";
  if (prov) {
    if (/cif|nif|numero/.test(k)) return "org.cif";
    if (/direcci|domicilio/.test(k)) return "org.address";
    return "org.name";
  }
  if (/cif/.test(k)) return "company.cif";
  if (/dni|nif|pasaporte|documento|identificaci/.test(k)) return "contact.dni";
  if (/sociedad|empresa|razon social|compania/.test(k)) return "company.name";
  if (/e-?mail|correo/.test(k)) return "contact.email";
  if (/telefono|movil/.test(k)) return "contact.phone";
  if (/direcci|domicilio/.test(k)) return "contact.address";
  if (/apellido/.test(k)) return "contact.lastName";
  // "Nombre del escultor / del proyecto…": no es el cliente → se pregunta al enviar.
  if (/nombre/.test(k) && /\bdel?\b|\bde la\b/.test(k) && !/cliente|representante|contacto|firmante|contratante/.test(k)) return "ask";
  if (/nombre|cliente|representante/.test(k)) return "contact.fullName";
  return "ask";
}
