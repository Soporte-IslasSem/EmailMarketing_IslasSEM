import "./ImportMenuModal.styles.css";

export default function ImportMenuModal({
  onClose,
  onSelectOption
}) {
  return (
    <div className="ImportMenuModal">
      <div className="ImportMenuModal__content">

        <h2>Importar plantilla</h2>

        <p className="ImportMenuModal__subtitle">
          Selecciona cómo deseas importar tu plantilla
        </p>

        <div className="ImportMenuModal__options">

          <button
            className="ImportMenuModal__option"
            onClick={() => onSelectOption("url")}
          >
            Desde URL
          </button>

          <button
            className="ImportMenuModal__option"
            onClick={() => onSelectOption("paste")}
          >
            Pegar HTML
          </button>

          <button
            className="ImportMenuModal__option"
            onClick={() => onSelectOption("html")}
          >
            Subir archivo HTML
          </button>

          <button
            className="ImportMenuModal__option"
            onClick={() => onSelectOption("zip")}
          >
            Importar archivo ZIP
          </button>

        </div>

        <div className="ImportMenuModal__actions">
          <button className="cancel" onClick={onClose}>
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
}
