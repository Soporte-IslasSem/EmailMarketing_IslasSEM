import "./ListAudiencias.styles.css";

export default function ListAudiencias() {
  return (
    <div className="ListAudiencias">
      <h2>Audiencias</h2>
      <p>Aquí podrás sincronizar la lista con audiencias externas (Facebook, Google Ads…).</p>

      <div className="audiencias-card">
        <div>
          <h3>Sincronizar audiencias externas</h3>
          <span className="audiencias-pro">Próximamente</span>
        </div>
        <button className="audiencias-btn" disabled title="Disponible próximamente">
          Próximamente
        </button>
      </div>
    </div>
  );
}
