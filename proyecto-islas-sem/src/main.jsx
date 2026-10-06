import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Imágenes que no existen en el servidor: se ocultan en vez de mostrar el icono roto.
document.addEventListener(
  "error",
  (e) => {
    if (e.target instanceof HTMLImageElement) e.target.style.visibility = "hidden";
  },
  true
);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
