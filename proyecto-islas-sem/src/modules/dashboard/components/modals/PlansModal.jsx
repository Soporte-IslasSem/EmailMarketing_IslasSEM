import "./PlansModal.styles.css";

export default function PlansModal({ onClose }) {
  const plans = [
    {
      name: "Gratis",
      price: "0€/mes",
      features: ["2.000 emails al mes", "Editor de plantillas", "Automatizaciones básicas"],
    },
    {
      name: "Profesional",
      price: "29€/mes",
      features: ["20.000 emails al mes", "Automatizaciones avanzadas", "Soporte prioritario"],
    },
    {
      name: "Empresas",
      price: "A medida",
      features: ["Volumen ilimitado", "Integraciones personalizadas", "Gestor dedicado"],
    },
  ];

  return (
    <div className="PlansModal__overlay">
      <div className="PlansModal__content">
        <button className="PlansModal__close" onClick={onClose}>×</button>

        <h2 className="PlansModal__title">Planes y Tarifas</h2>
        <p className="PlansModal__subtitle">
          Elige el plan que mejor se adapte a tu negocio. Sin permanencia y con soporte incluido.
        </p>

        <div className="PlansModal__grid">
          {plans.map((plan, i) => (
            <div key={i} className="PlansModal__card">
              <h3 className="PlansModal__cardTitle">{plan.name}</h3>
              <p className="PlansModal__price">{plan.price}</p>

              <ul className="PlansModal__features">
                {plan.features.map((f, j) => (
                  <li key={j}>{f}</li>
                ))}
              </ul>

              <button className="PlansModal__selectBtn">
                Ver detalles
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
