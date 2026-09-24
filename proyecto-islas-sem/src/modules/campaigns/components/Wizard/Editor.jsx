import { useEffect, useRef } from "react";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import "grapesjs-preset-newsletter";

export default function Editor({ html, onChange }) {
  const editorRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: "700px",
      fromElement: false,
      storageManager: false,
      plugins: ["gjs-preset-newsletter"],
      pluginsOpts: {
        "gjs-preset-newsletter": {},
      },
    });

    // Cargar HTML inicial
    if (html) {
      editor.setComponents(html);
    }

    // Detectar cambios
    editor.on("update", () => {
      const newHtml = editor.getHtml();
      onChange(newHtml);
    });

    editorRef.current = editor;

    return () => editor.destroy();
  }, []);

  return <div ref={containerRef} />;
}
