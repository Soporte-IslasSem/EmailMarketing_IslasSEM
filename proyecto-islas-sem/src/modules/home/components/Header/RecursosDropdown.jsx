import { Link } from "react-router-dom";
import "./RecursosDropdown.styles.css";

export default function RecursosDropdown() {
  return (
    <div className="RecursosDropdown">

      <Link to="/blog" className="RecursosDropdown__card">
        <h3>BLOG</h3>
        <p>Artículos sobre marketing, email y automatización.</p>
      </Link>

      <Link to="/glosario" className="RecursosDropdown__card">
        <h3>GLOSARIO</h3>
        <p>Conceptos clave del marketing digital.</p>
      </Link>

      <Link to="/otros-recursos" className="RecursosDropdown__card">
        <h3>GUÍAS Y EBOOKS</h3>
        <p>Material descargable para aprender a tu ritmo.</p>
      </Link>

    </div>
  );
}
