// Modal genérico del CRM.
export default function CrmModal({ title, onClose, children, footer, maxWidth }) {
  return (
    <div className="crm-modal__overlay" onClick={onClose}>
      <div
        className="crm-modal"
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crm-modal__head">
          <h3>{title}</h3>
          <button className="crm-modal__x" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="crm-modal__body">{children}</div>
        {footer && <div className="crm-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
