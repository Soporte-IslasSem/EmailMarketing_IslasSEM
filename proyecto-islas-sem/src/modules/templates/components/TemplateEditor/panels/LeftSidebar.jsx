import "./LeftSidebar.styles.css";

export default function LeftSidebar({ editor }) {
  return (
    <div className="LeftSidebar">

      <h3 className="LeftSidebar__title">Módulos</h3>

      <div className="LeftSidebar__category">
        <h4>Básicos</h4>
        <div id="blocks-basicos" className="LeftSidebar__blocks"></div>
      </div>

      <div className="LeftSidebar__category">
        <h4>Diseño</h4>
        <div id="blocks-diseno" className="LeftSidebar__blocks"></div>
      </div>

      <div className="LeftSidebar__category">
        <h4>Estructura</h4>
        <div id="blocks-estructura" className="LeftSidebar__blocks"></div>
      </div>

      <div className="LeftSidebar__category">
        <h4>Botones</h4>
        <div id="blocks-botones" className="LeftSidebar__blocks"></div>
      </div>

      <div className="LeftSidebar__category">
        <h4>Separadores</h4>
        <div id="blocks-separadores" className="LeftSidebar__blocks"></div>
      </div>

    </div>
  );
}
