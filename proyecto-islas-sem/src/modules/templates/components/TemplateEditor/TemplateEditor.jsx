import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import { doc, getDoc, updateDoc, addDoc, collection } from "firebase/firestore";
import { db, storage } from "../../../../config/firebaseConfig";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import html2canvas from "html2canvas";
import LeftSidebar from "./panels/LeftSidebar";
import "./TemplateEditor.styles.css";

// 🔥 IMPORTANTE: Necesitamos el usuario autenticado
import { useAuth } from "../../../../shared/hooks/useAuth";

import { inlineEditorHtml } from "../../../../utils/emailHtml";
export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth(); // ← Aquí obtenemos el UID

  const editorRef = useRef(null);
  const editorInstance = useRef(null);

  const [loading, setLoading] = useState(true);
  const [templateName, setTemplateName] = useState("");
  const [initialHtml, setInitialHtml] = useState("");

  // ================================
  // 1. Cargar plantilla desde Firestore
  // ================================
  useEffect(() => {
    const load = async () => {
      const refDoc = doc(db, "templates", id);
      const snap = await getDoc(refDoc);

      if (!snap.exists()) return;

      const data = snap.data();
      setTemplateName(data.name || "Plantilla sin nombre");

      setInitialHtml(
        data.html && data.html.trim() !== ""
          ? data.html
          : `
            <div class="email-wrapper">
              <h1>Plantilla vacía</h1>
              <p>Empieza a construir tu email arrastrando módulos desde la izquierda.</p>
            </div>
          `
      );

      setLoading(false);
    };

    load();
  }, [id]);

  // ================================
  // 2. Inicializar GrapesJS
  // ================================
  useEffect(() => {
    if (loading) return;
    if (!editorRef.current) return;
    if (editorInstance.current) return;

    const editor = grapesjs.init({
      container: editorRef.current,
      height: "100%",
      fromElement: false,
      storageManager: false,
      traitManager: { appendTo: ".RightPanel__traits" },
      styleManager: { appendTo: ".RightPanel__styles" },
      canvas: { styles: [] },
      panels: { defaults: [] },
    });

    editorInstance.current = editor;

    editor.on("load", () => {
      editor.setComponents(initialHtml);

      const iframe = editor.Canvas.getFrameEl();
      const iframeDoc = iframe?.contentDocument;

      if (iframeDoc) {
        const style = iframeDoc.createElement("style");
        style.innerHTML = `
          body {
            margin: 0;
            padding: 40px;
            background: #E8F4F3;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
          }

          .email-wrapper {
            max-width: 650px;
            background: white;
            padding: 32px;
            border-radius: 0;
            box-shadow: 0 2px 10px rgba(0,0,0,0.08);
            font-family: Inter, sans-serif;
          }
        `;
        iframeDoc.head.appendChild(style);
      }

      setTimeout(() => editor.refresh(), 200);
    });

    // Bloques personalizados
    const bm = editor.BlockManager;

    bm.add("titulo", {
      label: "Título",
      category: "Básicos",
      content: "<h1>Nuevo título</h1>",
    });

    bm.add("texto", {
      label: "Texto",
      category: "Básicos",
      content: "<p>Nuevo texto</p>",
    });

    bm.add("imagen", {
      label: "Imagen",
      category: "Diseño",
      content: `<img src="https://via.placeholder.com/600x200" />`,
    });

    bm.add("boton", {
      label: "Botón",
      category: "Botones",
      content: `<a href="#" style="display:inline-block;padding:12px 20px;background:#1A9190;color:white;text-decoration:none;">Botón</a>`,
    });

    bm.add("col-2", {
      label: "2 Columnas",
      category: "Estructura",
      content: `
        <div style="display:flex;gap:10px;">
          <div style="flex:1;">Columna 1</div>
          <div style="flex:1;">Columna 2</div>
        </div>
      `,
    });

    bm.add("separador", {
      label: "Separador",
      category: "Separadores",
      content: `<hr />`,
    });

    editor.BlockManager.render({ appendTo: "#blocks-basicos", category: "Básicos" });
    editor.BlockManager.render({ appendTo: "#blocks-diseno", category: "Diseño" });
    editor.BlockManager.render({ appendTo: "#blocks-estructura", category: "Estructura" });
    editor.BlockManager.render({ appendTo: "#blocks-botones", category: "Botones" });
    editor.BlockManager.render({ appendTo: "#blocks-separadores", category: "Separadores" });

    // Guardar HTML en Firestore
    editor.on("update", async () => {
      const html = inlineEditorHtml(editor);
      const refDoc = doc(db, "templates", id);
      await updateDoc(refDoc, { html });
    });

    return () => editor.destroy();
  }, [loading, initialHtml]);

  // ================================
  // 3. Generar miniatura automáticamente
  // ================================
  useEffect(() => {
    if (!editorInstance.current) return;

    const generateThumbnail = async () => {
      try {
        const canvasDoc = editorInstance.current.Canvas.getDocument();
        const body = canvasDoc.body;

        const canvas = await html2canvas(body, {
          backgroundColor: "#ffffff",
          scale: 0.25,
        });

        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );

        const storageRef = ref(storage, `templates/${user.uid}/${id}/thumbnail.png`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "templates", id), {
          thumbnail: url,
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error("❌ Error generando miniatura automática:", err);
      }
    };

    setTimeout(generateThumbnail, 1500);
  }, [editorInstance.current]);

  // ================================
  // 4. Botón manual de miniatura
  // ================================
  const handleUpdateThumbnail = async () => {
    if (!editorInstance.current) return;

    try {
      const canvasDoc = editorInstance.current.Canvas.getDocument();
      const body = canvasDoc.body;

      const canvas = await html2canvas(body, {
        backgroundColor: "#ffffff",
        scale: 0.5,
      });

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );

      const storageRef = ref(storage, `templates/${user.uid}/${id}/thumbnail.png`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);

      const refDoc = doc(db, "templates", id);
      await updateDoc(refDoc, { thumbnail: url });
    } catch (err) {
      console.error("❌ Error generando miniatura:", err);
    }
  };

  // ================================
  // 5. Enviar plantilla → Crear campaña y redirigir al flujo
  // ================================
  const handleSendTemplate = async () => {
    if (!editorInstance.current) return;

    try {
      const html = inlineEditorHtml(editorInstance.current);
      const refDoc = doc(db, "templates", id);
      const snap = await getDoc(refDoc);

      if (!snap.exists()) {
        alert("No se encontró la plantilla.");
        return;
      }

      const templateData = snap.data();

      // Las campañas usan "ownerId" (no "userId") como campo de dueño
      await addDoc(collection(db, "campaigns"), {
        ownerId: user.uid,
        config: {
          campaignName: templateData.name,
          subject: `Campaña basada en ${templateData.name}`,
          senderEmail: "no-reply@islassem.com",
          design: { html },
        },
        template: {
          templateId: id,
          templateName: templateData.name,
          html,
        },
        lists: { selectedLists: [] },
        send: { status: "pending" },
        step: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      alert("Plantilla lista para usar en campaña.");
      navigate("/dashboard/campaigns/create/config?type=newsletter");
    } catch (err) {
      console.error("❌ Error enviando plantilla:", err);
      alert("Error enviando plantilla. Revisa la consola.");
    }
  };

  return (
    <div className="TemplateEditor">
      {loading && (
        <div className="TemplateEditor__loading">Cargando editor...</div>
      )}

      <div className="TemplateEditor__topbar">
        <button onClick={() => navigate("/dashboard/templates")}>
          Volver
        </button>

        <div className="TemplateEditor__title">
          Editando {templateName}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="TemplateEditor__thumb"
            onClick={handleUpdateThumbnail}
          >
            Actualizar miniatura
          </button>

          <button
            className="TemplateEditor__send"
            onClick={handleSendTemplate}
          >
            Enviar plantilla
          </button>
        </div>
      </div>

      <div className="TemplateEditor__body">
        {editorInstance.current && (
          <LeftSidebar editor={editorInstance.current} />
        )}

        <div className="TemplateEditor__canvas-wrapper">
          <div className="TemplateEditor__canvas" ref={editorRef} />
        </div>

        <div className="RightPanel">
          <div className="RightPanel__styles"></div>
          <div className="RightPanel__traits"></div>
        </div>
      </div>
    </div>
  );
}
