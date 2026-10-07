import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import { doc, getDoc, updateDoc, addDoc, collection } from "firebase/firestore";
import { db, storage } from "../../../../config/firebaseConfig";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import html2canvas from "html2canvas";
import "./TemplateEditor.styles.css";

import { useAuth } from "../../../../shared/hooks/useAuth";
import { inlineEditorHtml, stripEditorOnly } from "../../../../utils/emailHtml";
import { CONTENT_BLOCKS, ROW_BLOCKS, BLANK_TEMPLATE } from "./editorBlocks";
import SimpleSettings from "./SimpleSettings";
import { closestRow, kindOf } from "./editorUtils";
import es from "grapesjs/locale/es";

const KIND_LABEL = { text: "Texto", button: "Botón", image: "Imagen", row: "Fila" };

const FONTS = [
  ["'Helvetica Neue',Helvetica,Arial,sans-serif", "Helvetica / Arial"],
  ["Georgia,'Times New Roman',serif", "Georgia"],
  ["Verdana,Geneva,sans-serif", "Verdana"],
  ["Tahoma,Geneva,sans-serif", "Tahoma"],
  ["'Trebuchet MS',Helvetica,sans-serif", "Trebuchet"],
  ["'Courier New',Courier,monospace", "Courier"],
];

// Estilos que solo ve el lienzo del editor (no se guardan en el correo).
const CANVAS_CSS = `
  body{margin:0;background:#ffffff;}
  [data-ism-row]{outline:1px dashed transparent;outline-offset:-1px}
  [data-ism-row]:hover{outline-color:#8f84ff}
`;

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const editorRef = useRef(null);
  const editorInstance = useRef(null);
  const contentBlocksRef = useRef(null);
  const rowBlocksRef = useRef(null);
  const saveTimer = useRef(null);

  const [loading, setLoading] = useState(true);
  const [templateName, setTemplateName] = useState("");
  const [initialHtml, setInitialHtml] = useState("");

  const [tab, setTab] = useState("content");
  const [device, setDevice] = useState("desktop");
  const [outline, setOutline] = useState(false);
  const [saveState, setSaveState] = useState("saved"); // saved | dirty | saving | error
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [, forceRender] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [preview, setPreview] = useState(null); // { html, device }
  const [htmlEdit, setHtmlEdit] = useState(null); // HTML del bloque en edición
  const [globals, setGlobals] = useState({ outerBg: "#f2f4f5", bodyBg: "#ffffff", font: FONTS[0][0], logo: "", logoCount: 0 });
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef(null);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2600);
  };

  // ================================ 1. Cargar plantilla
  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, "templates", id));
      if (!snap.exists()) {
        setNotice("No se encontró la plantilla.");
        return;
      }
      const data = snap.data();
      setTemplateName(data.name || "Plantilla sin nombre");
      setInitialHtml(data.html && data.html.trim() !== "" ? data.html : BLANK_TEMPLATE);
      setLoading(false);
    };
    load();
  }, [id]);

  // ================================ 2. Guardado (automático y manual)
  const saveNow = useCallback(async () => {
    const editor = editorInstance.current;
    if (!editor) return;
    clearTimeout(saveTimer.current);
    setSaveState("saving");
    try {
      await updateDoc(doc(db, "templates", id), { html: inlineEditorHtml(editor), updatedAt: new Date() });
      setSaveState("saved");
    } catch (err) {
      console.error("Error guardando plantilla:", err);
      setSaveState("error");
    }
  }, [id]);

  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, 1500);
  }, [saveNow]);

  // ================================ 3. Miniatura
  const generateThumbnail = useCallback(async (scale = 0.35) => {
    const editor = editorInstance.current;
    if (!editor || !user) return false;
    try {
      const canvas = await html2canvas(editor.Canvas.getDocument().body, { backgroundColor: "#ffffff", scale, useCORS: true });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const storageRef = ref(storage, `templates/${user.uid}/${id}/thumbnail.png`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "templates", id), { thumbnail: url, updatedAt: new Date() });
      return true;
    } catch (err) {
      console.error("Error generando miniatura:", err);
      return false;
    }
  }, [id, user]);

  // Lee los ajustes generales (fondos y tipografía) del documento cargado.
  const readGlobals = (editor) => {
    const wrapper = editor.getWrapper();
    const outer = wrapper.find("[data-ism-outer]")[0];
    const container = wrapper.find(".ism-container")[0];
    const logos = wrapper.find("[data-ism-logo]");
    setGlobals({
      outerBg: outer?.getAttributes().bgcolor || outer?.getStyle().background || "#f2f4f5",
      bodyBg: container?.getAttributes().bgcolor || container?.getStyle().background || "#ffffff",
      font: container?.getStyle()["font-family"] || FONTS[0][0],
      logo: logos[0]?.get("src") || "",
      logoCount: logos.length,
    });
  };

  // Sube un archivo a Storage (carpeta de la plantilla) y devuelve su URL pública.
  const uploadImage = async (file) => {
    const safe = file.name.replace(/[^\w.-]+/g, "_");
    const storageRef = ref(storage, `templates/${user.uid}/${id}/img-${Date.now()}-${safe}`);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  };

  // Pone la misma imagen en todos los logos de la plantilla (cabeceras, pies…).
  const applyLogo = (url) => {
    const editor = editorInstance.current;
    if (!editor || !url) return 0;
    const logos = editor.getWrapper().find("[data-ism-logo]");
    logos.forEach((c) => c.set("src", url));
    editor.AssetManager.add({ src: url, name: "Logo" });
    readGlobals(editor);
    return logos.length;
  };

  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { flash("El logo tiene que ser una imagen (PNG, JPG o GIF)."); return; }
    setLogoBusy(true);
    try {
      const url = await uploadImage(file);
      const n = applyLogo(url);
      flash(n ? `Logo aplicado en ${n} ${n === 1 ? "sitio" : "sitios"} de la plantilla` : "Logo subido. Añade un bloque «Logo» para mostrarlo.");
    } catch (err) {
      console.error("Error subiendo logo:", err);
      flash("No se pudo subir el logo.");
    } finally {
      setLogoBusy(false);
    }
  };

  // ================================ 4. Inicializar GrapesJS
  useEffect(() => {
    if (loading || !editorRef.current || editorInstance.current) return;

    const editor = grapesjs.init({
      container: editorRef.current,
      height: "100%",
      width: "auto",
      fromElement: false,
      storageManager: false,
      panels: { defaults: [] },
      i18n: { locale: "es", detectLocale: false, messages: { es } },
      selectorManager: { componentFirst: true },
      traitManager: { appendTo: "#te-traits" },
      styleManager: {
        appendTo: "#te-styles",
        sectors: [
          { name: "Texto", open: true, properties: ["font-family", "font-size", "font-weight", "color", "text-align", "line-height", "letter-spacing"] },
          { name: "Fondo", open: true, properties: ["background-color"] },
          { name: "Espaciado", open: false, properties: ["padding", "margin"] },
          { name: "Tamaño", open: false, properties: ["width", "max-width", "height"] },
          { name: "Bordes", open: false, properties: ["border-radius", "border"] },
        ],
      },
      deviceManager: {
        devices: [
          { id: "desktop", name: "Escritorio", width: "" },
          { id: "mobile", name: "Móvil", width: "390px", widthMedia: "480px" },
        ],
      },
      assetManager: {
        autoAdd: true,
        uploadText: "Arrastra aquí una imagen o haz clic para subirla",
        addBtnText: "Añadir por URL",
        modalTitle: "Elegir imagen",
        uploadFile: async (e) => {
          const files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
          for (const file of files) {
            try {
              const safe = file.name.replace(/[^\w.-]+/g, "_");
              const storageRef = ref(storage, `templates/${user.uid}/${id}/img-${Date.now()}-${safe}`);
              await uploadBytes(storageRef, file);
              const url = await getDownloadURL(storageRef);
              editor.AssetManager.add({ src: url, name: file.name });
            } catch (err) {
              console.error("Error subiendo imagen:", err);
              setNotice("No se pudo subir la imagen.");
            }
          }
        },
      },
      canvas: { styles: [] },
    });
    editorInstance.current = editor;

    // ---- Tipos propios: filas, cuerpo y contenedores bloqueados
    const dc = editor.DomComponents;
    dc.addType("ism-row", {
      extend: "table",
      isComponent: (el) => el.tagName === "TABLE" && el.hasAttribute?.("data-ism-row"),
      model: { defaults: { name: "Fila", draggable: "[data-ism-body]" } },
    });
    dc.addType("ism-body", {
      extend: "cell",
      isComponent: (el) => el.tagName === "TD" && el.hasAttribute?.("data-ism-body"),
      model: { defaults: { name: "Cuerpo", droppable: "[data-ism-row]", draggable: false, removable: false, copyable: false, selectable: false, hoverable: false, badgable: false } },
    });
    dc.addType("ism-outer", {
      extend: "table",
      isComponent: (el) => el.tagName === "TABLE" && el.hasAttribute?.("data-ism-outer"),
      model: { defaults: { name: "Fondo", draggable: false, removable: false, copyable: false, selectable: false, hoverable: false } },
    });
    dc.addType("ism-container", {
      extend: "table",
      isComponent: (el) => el.tagName === "TABLE" && el.classList?.contains("ism-container"),
      model: { defaults: { name: "Contenedor", draggable: false, removable: false, copyable: false, selectable: false, hoverable: false } },
    });

    // ---- Bloques (Contenido y Filas) pintados en el panel derecho
    const bm = editor.BlockManager;
    // Un clic en un bloque lo añade sin arrastrar: debajo de lo seleccionado o al final.
    const insertBlock = (content, isRow) => {
      const body = editor.getWrapper().find("[data-ism-body]")[0];
      if (!body) return;
      const sel = editor.getSelected();
      const row = sel ? closestRow(sel) : null;
      let added;
      if (isRow) {
        const at = row ? row.index() + 1 : body.components().length;
        added = body.components().add(content, { at });
      } else if (sel && row && sel !== row && (sel.get("tagName") || "").toLowerCase() === "td") {
        added = sel.components().add(content);
      } else if (sel && row && sel !== row && sel.parent()) {
        added = sel.parent().components().add(content, { at: sel.index() + 1 });
      } else if (row) {
        const cell = row.find("td").pop();
        added = cell.components().add(content);
      } else {
        added = body.components().add(ROW_BLOCKS[0].content);
        const cell = (Array.isArray(added) ? added[0] : added).find("td")[0];
        cell.components().reset();
        added = cell.components().add(content);
      }
      const comp = Array.isArray(added) ? added[0] : added;
      if (comp) {
        const target = focusTarget(comp);
        editor.select(target);
        target.getEl()?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    // Al añadir un bloque se selecciona lo que el usuario querrá tocar: el botón, la imagen…
    const focusTarget = (comp) => {
      if (comp.get("type") === "ism-row") return comp;
      const link = comp.find("a").find((a) => a.parent()?.getAttributes().bgcolor);
      if (link) return link;
      if (comp.get("type") === "image") return comp;
      const imgs = comp.find("img");
      if (imgs.length === 1) return imgs[0];
      return comp;
    };
    // Cuando una columna recibe contenido, desaparece su aviso "Arrastra aquí…".
    editor.on("component:add", (c) => {
      const parent = c.parent?.();
      if (!parent || c.getAttributes()["data-ism-empty"] !== undefined) return;
      parent.components().filter((x) => x.getAttributes()["data-ism-empty"] !== undefined).forEach((x) => x.remove());
    });
    CONTENT_BLOCKS.forEach((b) => bm.add(b.id, { label: b.label, media: b.media, content: b.content, activate: !!b.activate, select: true, category: "Contenido", onClick: () => insertBlock(b.content, false) }));
    ROW_BLOCKS.forEach((b) => bm.add(b.id, { label: b.label, media: b.media, content: b.content, category: "Filas", onClick: () => insertBlock(b.content, true) }));
    if (import.meta.env.DEV) window.__ismEditor = editor;
    const renderBlocks = (target, prefix) => {
      if (!target) return;
      const el = bm.render(bm.getAll().filter((b) => b.getId().startsWith(prefix)), { external: true });
      target.innerHTML = "";
      target.appendChild(el);
    };
    renderBlocks(contentBlocksRef.current, "c-");
    renderBlocks(rowBlocksRef.current, "r-");

    editor.on("load", () => {
      editor.setComponents(initialHtml);
      const frameDoc = editor.Canvas.getDocument();
      if (frameDoc) {
        const style = frameDoc.createElement("style");
        style.innerHTML = CANVAS_CSS;
        frameDoc.head.appendChild(style);
      }
      readGlobals(editor);
      editor.UndoManager.clear();
      setSaveState("saved");
      setTimeout(() => editor.refresh(), 200);
      setTimeout(() => generateThumbnail(), 1800);
      // A partir de aquí, cualquier cambio programa el autoguardado.
      editor.on("update", scheduleSave);
    });

    editor.on("component:toggled", () => {
      const sel = editor.getSelected();
      setSelected(sel || null);
      setHtmlEdit(null);
      if (sel) setTab("settings");
      else readGlobals(editor);
    });
    editor.on("component:update", () => forceRender((n) => n + 1));

    return () => {
      clearTimeout(saveTimer.current);
      editor.destroy();
      editorInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialHtml]);

  // ================================ 5. Acciones de la barra
  const changeDevice = (d) => {
    setDevice(d);
    editorInstance.current?.setDevice(d);
  };

  const toggleOutline = () => {
    const editor = editorInstance.current;
    if (!editor) return;
    const cmd = "core:component-outline";
    if (editor.Commands.isActive(cmd)) editor.stopCommand(cmd);
    else editor.runCommand(cmd);
    setOutline(editor.Commands.isActive(cmd));
  };

  const openPreview = () => {
    if (!editorInstance.current) return;
    setPreview({ html: stripEditorOnly(inlineEditorHtml(editorInstance.current)), device: "desktop" });
  };

  const downloadHtml = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${templateName}</title></head><body style="margin:0;padding:0;">${stripEditorOnly(inlineEditorHtml(editorInstance.current))}</body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `${(templateName || "plantilla").replace(/[^\w-]+/g, "_")}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMenuOpen(false);
  };

  const clearTemplate = () => {
    editorInstance.current?.setComponents(BLANK_TEMPLATE);
    readGlobals(editorInstance.current);
    setConfirmClear(false);
    setMenuOpen(false);
    flash("Plantilla vaciada. Puedes recuperarla con Deshacer.");
  };

  const handleSendTemplate = async () => {
    const editor = editorInstance.current;
    if (!editor) return;
    try {
      await saveNow();
      const html = stripEditorOnly(inlineEditorHtml(editor));
      // Las campañas usan "ownerId" (no "userId") como campo de dueño
      await addDoc(collection(db, "campaigns"), {
        ownerId: user.uid,
        config: {
          campaignName: templateName,
          subject: `Campaña basada en ${templateName}`,
          senderEmail: "no-reply@islassem.com",
          design: { html },
        },
        template: { templateId: id, templateName, html },
        lists: { selectedLists: [] },
        send: { status: "pending" },
        step: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      navigate("/dashboard/campaigns/create/config?type=newsletter");
    } catch (err) {
      console.error("Error enviando plantilla:", err);
      setNotice("No se pudo preparar la campaña. Inténtalo de nuevo.");
    }
  };

  // ================================ 6. Ajustes generales y del bloque seleccionado
  const setGlobal = (key, value) => {
    const editor = editorInstance.current;
    if (!editor) return;
    const wrapper = editor.getWrapper();
    if (key === "outerBg") {
      const outer = wrapper.find("[data-ism-outer]")[0];
      outer?.addAttributes({ bgcolor: value });
      outer?.addStyle({ background: value });
    }
    if (key === "bodyBg") {
      const container = wrapper.find(".ism-container")[0];
      container?.addAttributes({ bgcolor: value });
      container?.addStyle({ background: value });
    }
    if (key === "font") wrapper.find(".ism-container")[0]?.addStyle({ "font-family": value });
    setGlobals((g) => ({ ...g, [key]: value }));
  };

  const selType = selected?.get("type");
  const selName = selected ? selected.getName?.() || selType : "";
  const selKind = selected ? kindOf(selected) : null;
  const selRow = selected ? closestRow(selected) : null;
  const isLogo = selType === "image" && selected?.getAttributes()["data-ism-logo"] !== undefined;
  const selParent = selected?.parent();
  const canSelectParent = !!selParent && !["ism-body", "ism-container", "ism-outer", "wrapper"].includes(selParent.get("type")) && selParent.get("selectable") !== false;

  const duplicateSelected = () => {
    if (!selected) return;
    const clone = selected.clone();
    selected.parent().components().add(clone, { at: selected.index() + 1 });
    editorInstance.current.select(clone);
  };
  const removeSelected = () => {
    if (!selected) return;
    selected.remove();
    editorInstance.current.select(null);
  };
  const applyHtmlEdit = () => {
    if (!selected || htmlEdit == null) return;
    const created = selected.replaceWith(htmlEdit);
    setHtmlEdit(null);
    const first = Array.isArray(created) ? created[0] : created;
    editorInstance.current.select(first || null);
  };

  const saveLabel = { saved: "Guardado", dirty: "Cambios sin guardar", saving: "Guardando…", error: "Error al guardar" }[saveState];

  return (
    <div className="TE">
      {/* Cabecera */}
      <div className="TE__head">
        <div className="TE__head-left">
          <button className="TE__back" onClick={() => navigate("/dashboard/templates?ver=mis")}>‹ Volver</button>
          <div>
            <h1 className="TE__title">Editando {templateName}</h1>
            <p className="TE__subtitle">Desde aquí puedes editar y diseñar tu plantilla.</p>
          </div>
        </div>
        <button className="TE__btn TE__btn--primary" onClick={handleSendTemplate} disabled={loading}>
          Enviar plantilla
        </button>
      </div>

      <div className="TE__frame">
        {/* Barra de herramientas */}
        <div className="TE__toolbar">
          <div className="TE__toolbar-left">
            <button className="TE__btn" onClick={openPreview}>Vista previa</button>
            <button className={`TE__btn ${outline ? "is-on" : ""}`} onClick={toggleOutline}>
              {outline ? "Ocultar estructura" : "Mostrar estructura"}
            </button>
            <button className="TE__icon" title="Deshacer" onClick={() => editorInstance.current?.UndoManager.undo()}>↶</button>
            <button className="TE__icon" title="Rehacer" onClick={() => editorInstance.current?.UndoManager.redo()}>↷</button>
          </div>
          <div className="TE__toolbar-right">
            <span className={`TE__status TE__status--${notice ? "notice" : saveState}`}>{notice || saveLabel}</span>
            <button className="TE__btn" onClick={() => saveNow().then(() => flash("Plantilla guardada"))}>Guardar plantilla</button>
            <div className="TE__menu-wrap">
              <button className="TE__btn TE__btn--dots" onClick={() => { setMenuOpen((o) => !o); setConfirmClear(false); }}>⋯</button>
              {menuOpen && (
                <div className="TE__menu" onMouseLeave={() => setMenuOpen(false)}>
                  <button onClick={async () => { setMenuOpen(false); flash((await generateThumbnail(0.5)) ? "Miniatura actualizada" : "No se pudo actualizar la miniatura"); }}>Actualizar miniatura</button>
                  <button onClick={downloadHtml}>Descargar HTML</button>
                  {!confirmClear ? (
                    <button className="danger" onClick={() => setConfirmClear(true)}>Vaciar plantilla</button>
                  ) : (
                    <button className="danger" onClick={clearTemplate}>¿Seguro? Sí, vaciar</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="TE__main">
          {/* Lienzo */}
          <div className="TE__canvas-col">
            <div className="TE__devices">
              <button className={device === "desktop" ? "is-on" : ""} title="Escritorio" onClick={() => changeDevice("desktop")}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
              </button>
              <button className={device === "mobile" ? "is-on" : ""} title="Móvil" onClick={() => changeDevice("mobile")}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></svg>
              </button>
            </div>
            {!loading && !selected && (
              <div className="TE__canvas-hint">Clic en un elemento para editarlo · doble clic para escribir</div>
            )}
            <div className="TE__canvas" ref={editorRef} />
            {loading && <div className="TE__loading">{notice || "Cargando editor…"}</div>}
          </div>

          {/* Panel derecho */}
          <aside className="TE__side">
            <div className="TE__tabs">
              {[["content", "Contenido"], ["rows", "Filas"], ["settings", "Ajustes"]].map(([k, l]) => (
                <button key={k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>

            <div className="TE__panel" style={{ display: tab === "content" ? "block" : "none" }}>
              <p className="TE__hint"><strong>Haz clic</strong> en un bloque para añadirlo debajo de lo que tengas seleccionado, o arrástralo al sitio exacto del correo.</p>
              <div ref={contentBlocksRef} className="TE__blocks" />
            </div>

            <div className="TE__panel" style={{ display: tab === "rows" ? "block" : "none" }}>
              <p className="TE__hint"><strong>Haz clic</strong> en una estructura para añadirla debajo de la fila seleccionada (o al final), o arrástrala entre las filas del correo.</p>
              <div ref={rowBlocksRef} className="TE__blocks TE__blocks--rows" />
            </div>

            <div className="TE__panel" style={{ display: tab === "settings" ? "block" : "none" }}>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={handleLogoFile} />
              {!selected && (
                <div className="TE__settings">
                  <h3>Ajustes generales</h3>
                  <div className="TE__logo">
                    <span className="TE__logo-label">Logo</span>
                    <div className="TE__logo-preview">
                      {globals.logo ? <img src={globals.logo} alt="Logo actual" /> : <em>Esta plantilla no tiene logo</em>}
                    </div>
                    <button className="TE__btn TE__btn--full TE__btn--accent" disabled={logoBusy} onClick={() => logoInputRef.current?.click()}>
                      {logoBusy ? "Subiendo…" : "Subir mi logo"}
                    </button>
                    <p className="TE__hint">
                      {globals.logoCount
                        ? `${globals.logoCount === 1 ? "Se colocará donde aparece el logo" : `Se colocará en los ${globals.logoCount} sitios donde aparece el logo`}. Mejor PNG con fondo transparente, de unos 320 px de ancho.`
                        : "Arrastra el bloque «Logo» desde Contenido para añadirlo."}
                    </p>
                  </div>
                  <label>Color de fondo
                    <span className="TE__color"><input type="color" value={toHex(globals.outerBg)} onChange={(e) => setGlobal("outerBg", e.target.value)} /><code>{toHex(globals.outerBg)}</code></span>
                  </label>
                  <label>Color del contenido
                    <span className="TE__color"><input type="color" value={toHex(globals.bodyBg)} onChange={(e) => setGlobal("bodyBg", e.target.value)} /><code>{toHex(globals.bodyBg)}</code></span>
                  </label>
                  <label>Tipografía por defecto
                    <select value={globals.font} onChange={(e) => setGlobal("font", e.target.value)}>
                      {!FONTS.some(([v]) => v === globals.font) && <option value={globals.font}>Actual</option>}
                      {FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <p className="TE__hint">Haz clic en cualquier elemento del correo para cambiar su texto, colores, márgenes o enlace. Doble clic sobre un texto para escribir.</p>
                </div>
              )}

              {selected && (
                <div className="TE__settings">
                  <div className="TE__sel-head">
                    <h3>{isLogo ? "Logo" : KIND_LABEL[selKind] || selName}</h3>
                    <button className="TE__link" title="Cerrar" onClick={() => editorInstance.current.select(null)}>✕</button>
                  </div>
                  <div className="TE__sel-actions">
                    {selRow && selRow !== selected && <button onClick={() => editorInstance.current.select(selRow)}>Seleccionar fila</button>}
                    {selected.get("copyable") !== false && <button onClick={duplicateSelected}>Duplicar</button>}
                    {selected.get("removable") !== false && <button className="danger" onClick={removeSelected}>Eliminar</button>}
                  </div>

                  {isLogo && (
                    <div className="TE__group">
                      <button className="TE__btn TE__btn--full TE__btn--accent" disabled={logoBusy} onClick={() => logoInputRef.current?.click()}>
                        {logoBusy ? "Subiendo…" : "Subir mi logo"}
                      </button>
                      <p className="TE__hint">Se coloca en todos los sitios de la plantilla donde aparece el logo.</p>
                    </div>
                  )}

                  {!isLogo && (
                    <SimpleSettings comp={selected} getEditor={() => editorInstance.current} toHex={toHex} onChange={() => forceRender((n) => n + 1)} />
                  )}
                </div>
              )}

              <details className="TE__advanced" style={{ display: selected ? "block" : "none" }}>
                <summary>Opciones avanzadas</summary>
                {selected && canSelectParent && (
                  <button className="TE__btn TE__btn--full" onClick={() => editorInstance.current.select(selParent)}>Seleccionar elemento superior</button>
                )}
                {selected && (htmlEdit == null ? (
                  <button className="TE__btn TE__btn--full" onClick={() => setHtmlEdit(selected.toHTML())}>Editar HTML</button>
                ) : (
                  <div className="TE__group">
                    <textarea className="TE__code" value={htmlEdit} onChange={(e) => setHtmlEdit(e.target.value)} spellCheck={false} />
                    <div className="TE__sel-actions">
                      <button onClick={applyHtmlEdit}>Aplicar</button>
                      <button onClick={() => setHtmlEdit(null)}>Cancelar</button>
                    </div>
                  </div>
                ))}
                <div id="te-traits" className="TE__gjs" />
                <div id="te-styles" className="TE__gjs" />
              </details>
            </div>
          </aside>
        </div>
      </div>

      {/* Vista previa */}
      {preview && (
        <div className="TE__modal" onClick={() => setPreview(null)}>
          <div className="TE__modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="TE__modal-head">
              <strong>Vista previa</strong>
              <div className="TE__devices TE__devices--inline">
                <button className={preview.device === "desktop" ? "is-on" : ""} onClick={() => setPreview((p) => ({ ...p, device: "desktop" }))}>Escritorio</button>
                <button className={preview.device === "mobile" ? "is-on" : ""} onClick={() => setPreview((p) => ({ ...p, device: "mobile" }))}>Móvil</button>
              </div>
              <button className="TE__link" onClick={() => setPreview(null)}>✕</button>
            </div>
            <div className="TE__modal-body">
              <iframe
                title="Vista previa"
                className={`TE__preview TE__preview--${preview.device}`}
                srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${preview.html}</body></html>`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// "#abc", "rgb(...)" o "#aabbcc url(...)" → "#rrggbb" para <input type="color">
function toHex(v) {
  const s = String(v || "").trim();
  let m = s.match(/#([0-9a-f]{6})\b/i);
  if (m) return `#${m[1].toLowerCase()}`;
  m = s.match(/#([0-9a-f]{3})\b/i);
  if (m) return `#${m[1].split("").map((c) => c + c).join("").toLowerCase()}`;
  m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, "0")).join("")}`;
  return "#ffffff";
}
