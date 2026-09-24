export default function Header({ method, handleAdd }) {
  return (
    <div className="ListDetail__tabsRow">
      <div className="ListDetail__tabs">
        <button className="active">Suscriptores</button>
      </div>

      <button
        className={`ListDetail__add ${method ? "enabled" : "disabled"}`}
        disabled={!method}
        onClick={handleAdd}
      >
        Añadir
      </button>
    </div>
  );
}
