import "./ImportPreviewModal.styles.css";

export default function ImportPreviewModal({
  validEmails,
  invalidEmails,
  duplicateEmails,
  onConfirm,
  onCancel,
}) {
  const totalEmails =
    validEmails.length + invalidEmails.length + duplicateEmails.length;

  return (
    <div className="IPModal__overlay">
      <div className="IPModal__box">

        <h2 className="IPModal__title">Vista previa de importación</h2>

        <p className="IPModal__summary">
          Total: {totalEmails} emails
        </p>

        {/* Emails válidos */}
        <div className="IPModal__section">
          <h3>Emails válidos ({validEmails.length})</h3>
          <div className="IPModal__list valid">
            {validEmails.map((email, i) => (
              <p key={i}>{email}</p>
            ))}
          </div>
        </div>

        {/* Emails inválidos */}
        {invalidEmails.length > 0 && (
          <div className="IPModal__section">
            <h3>Emails inválidos ({invalidEmails.length})</h3>
            <div className="IPModal__list invalid">
              {invalidEmails.map((email, i) => (
                <p key={i}>{email}</p>
              ))}
            </div>
          </div>
        )}

        {/* Duplicados */}
        {duplicateEmails.length > 0 && (
          <div className="IPModal__section">
            <h3>Duplicados ({duplicateEmails.length})</h3>
            <div className="IPModal__list duplicates">
              {duplicateEmails.map((email, i) => (
                <p key={i}>{email}</p>
              ))}
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="IPModal__buttons">
          <button type="button" className="cancel" onClick={onCancel}>
            Cancelar
          </button>

          <button
            type="button"
            className="confirm"
            onClick={onConfirm}
            disabled={validEmails.length === 0}
          >
            Confirmar importación
          </button>
        </div>

      </div>
    </div>
  );
}
