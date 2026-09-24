// src/modules/lists/components/segments/SegmentTable.jsx
import "./SegmentTable.styles.css";

export default function SegmentTable({ segments, onDelete }) {
  return (
    <table className="SegmentTable">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Modo</th>
          <th>Condiciones</th>
          <th>Creado</th>
          <th></th>
        </tr>
      </thead>

      <tbody>
        {segments.map((seg) => (
          <tr key={seg.id}>
            <td>{seg.name}</td>
            <td>{seg.mode === "any" ? "Cualquiera" : "Todas"}</td>
            <td>{seg.conditions.length}</td>
            <td>
              {seg.createdAt?.toDate
                ? seg.createdAt.toDate().toLocaleDateString()
                : "-"}
            </td>
            <td>
              <button
                className="SegmentTable__delete"
                onClick={() => onDelete(seg.id)}
              >
                Eliminar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
