// Editor tipo Word de una plantilla: se escribe directamente sobre el documento, con barra de
// formato (negrita, cursiva, subrayado, títulos, listas, alineación). Los huecos [..] se ven
// resaltados. onChange(bloques) cada vez que cambia el texto.
import { useEffect, useRef } from "react";
import { blocksToHtml, htmlToBlocks } from "../lib/docEdit";
import "./contracts.css";

const TOOLS = [
  ["bold", "B", "Negrita (Ctrl+B)", { fontWeight: 800 }],
  ["italic", "I", "Cursiva (Ctrl+I)", { fontStyle: "italic" }],
  ["underline", "U", "Subrayado (Ctrl+U)", { textDecoration: "underline" }],
  "|",
  ["h1", "Título 1", "Título grande"],
  ["h2", "Título 2", "Título de apartado"],
  ["h3", "Título 3", "Subapartado"],
  ["p", "Normal", "Texto normal"],
  "|",
  ["insertUnorderedList", "• Lista", "Lista con viñetas"],
  ["insertOrderedList", "1. Lista", "Lista numerada"],
  "|",
  ["justifyCenter", "≡", "Centrar"],
  ["justifyRight", "⯈", "Alinear a la derecha"],
  ["justifyFull", "☰", "Justificado (normal)"],
  "|",
  ["hole", "[ ] Hueco", "Insertar un dato que cambia en cada envío, p. ej. [Nombre del Cliente]"],
  ["undo", "↶", "Deshacer (Ctrl+Z)"],
  ["redo", "↷", "Rehacer (Ctrl+Y)"],
];

export default function DocEditor({ blocks, onChange, version = 0 }) {
  const ref = useRef(null);
  const timer = useRef(0);
  const changed = useRef(onChange);
  useEffect(() => { changed.current = onChange; }, [onChange]);

  // El HTML se pone al abrir (y al sustituir el documento): luego manda lo que se escribe.
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = blocksToHtml(blocks);
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* navegador sin soporte */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const emit = (now = false) => {
    clearTimeout(timer.current);
    const run = () => ref.current && changed.current(htmlToBlocks(ref.current));
    if (now) run(); else timer.current = setTimeout(run, 250);
  };

  const exec = (cmd) => {
    ref.current?.focus();
    if (/^h[123]$|^p$/.test(cmd)) document.execCommand("formatBlock", false, cmd === "p" ? "P" : cmd.toUpperCase());
    else if (cmd === "hole") {
      const name = window.prompt("Nombre del dato (por ejemplo: Nombre del Cliente, DNI del Cliente, Importe):");
      if (!name || !name.trim()) return;
      document.execCommand("insertText", false, `[${name.trim().replace(/[[\]]/g, "").slice(0, 100)}]`);
    } else document.execCommand(cmd, false, null);
    emit(true);
  };

  // Pegar como texto (sin estilos ni basura de otras webs); cada línea, un párrafo.
  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const html = text.split(/\r?\n/).map((l) => l.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))).join("<br>");
    document.execCommand("insertHTML", false, html);
    emit();
  };

  return (
    <div className="doc-editor">
      <div className="doc-editor__bar" role="toolbar" aria-label="Formato">
        {TOOLS.map((t, i) => (t === "|"
          ? <span key={i} className="doc-editor__sep" />
          : <button key={t[0]} type="button" title={t[2]} style={t[3]} onMouseDown={(e) => { e.preventDefault(); exec(t[0]); }}>{t[1]}</button>))}
      </div>
      <div
        ref={ref}
        className="doc-editor__page ctr-doc"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        lang="es"
        onInput={() => emit()}
        onBlur={() => emit(true)}
        onPaste={onPaste}
        data-testid="doc-editor"
      />
    </div>
  );
}
