// Distintivo del tipo de cliente (color e icono definidos en "Tipos de cliente").
export default function TypeChip({ t }) {
  if (!t) return <span style={{ color: "var(--crm-muted)" }}>—</span>;
  return (
    <span className="crm-chip" style={{ background: `${t.color}1f`, color: t.color, fontWeight: 600 }}>
      {t.icon ? `${t.icon} ` : ""}{t.label}
    </span>
  );
}
