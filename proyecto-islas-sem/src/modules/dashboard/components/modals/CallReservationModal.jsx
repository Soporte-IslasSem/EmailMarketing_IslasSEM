import "./CallReservationModal.styles.css";

export default function CallReservationModal({ onClose }) {
  return (
    <div className="CallReservationModal__overlay">
      <div className="CallReservationModal__content">
        <h2 className="CallReservationModal__title">Reserva una llamada</h2>
        <p className="CallReservationModal__description">
          Nuestro equipo estará encantado de atenderte.  
          Elige una fecha y hora para tu llamada y te contactaremos por correo.
        </p>

        <form className="CallReservationModal__form">
          <div className="CallReservationModal__field">
            <label htmlFor="date" className="CallReservationModal__label">
              Fecha:
            </label>
            <input
              id="date"
              type="date"
              className="CallReservationModal__input"
              required
            />
          </div>

          <div className="CallReservationModal__field">
            <label htmlFor="time" className="CallReservationModal__label">
              Hora:
            </label>
            <input
              id="time"
              type="time"
              className="CallReservationModal__input"
              required
            />
          </div>

          <div className="CallReservationModal__field">
            <label htmlFor="email" className="CallReservationModal__label">
              Correo de contacto:
            </label>
            <input
              id="email"
              type="email"
              placeholder="tuemail@empresa.com"
              className="CallReservationModal__input"
              required
            />
          </div>

          <button type="submit" className="CallReservationModal__button">
            Confirmar reserva
          </button>
        </form>

        <button onClick={onClose} className="CallReservationModal__close">
          ✕
        </button>
      </div>
    </div>
  );
}
