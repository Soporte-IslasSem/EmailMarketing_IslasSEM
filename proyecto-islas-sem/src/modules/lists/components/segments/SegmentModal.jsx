import { useEffect, useState } from "react";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../../../config/firebaseConfig";
import "./SegmentModal.styles.css";

export default function SegmentModal({ listId, onClose }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("any");
  const [conditions, setConditions] = useState([]);

  const [fields, setFields] = useState([]);
  const [subscribers, setSubscribers] = useState([]);

  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const TEXT_OPERATORS = [
    { id: "equals", label: "igual que" },
    { id: "contains", label: "contiene" },
    { id: "not_contains", label: "no contiene" },
    { id: "not_equals", label: "distinto de" },
  ];

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      const fieldsSnap = await getDocs(collection(db, "lists", listId, "fields"));
      const customFields = fieldsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
      }));

      const nativeFields = [
        { id: "email", name: "Email" },
        { id: "createdAt", name: "Fecha de alta" },
        { id: "status", name: "Estado" },
      ];

      setFields([...nativeFields, ...customFields]);

      const subsSnap = await getDocs(
        query(
          collection(db, "subscribers"),
          where("listId", "==", listId),
          where("userId", "==", auth.currentUser.uid)
        )
      );

      const subs = subsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setSubscribers(subs);
      setLoading(false);
    };

    loadData();
  }, [listId]);

  const addCondition = () => {
    setConditions([
      ...conditions,
      { field: "email", operator: "equals", value: "" },
    ]);
  };

  const updateCondition = (index, key, value) => {
    const updated = [...conditions];
    updated[index][key] = value;
    setConditions(updated);
  };

  const removeCondition = (index) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const checkCondition = (sub, cond) => {
    const fieldValue =
      cond.field in sub ? sub[cond.field] : sub.fields?.[cond.field] || "";

    const val = cond.value.toLowerCase();
    const fv = String(fieldValue || "").toLowerCase();

    switch (cond.operator) {
      case "equals": return fv === val;
      case "not_equals": return fv !== val;
      case "contains": return fv.includes(val);
      case "not_contains": return !fv.includes(val);
      default: return false;
    }
  };

  const recalc = () => {
    if (conditions.length === 0) {
      setMatches(0);
      return;
    }

    const filtered = subscribers.filter((sub) => {
      return mode === "all"
        ? conditions.every((c) => checkCondition(sub, c))
        : conditions.some((c) => checkCondition(sub, c));
    });

    setMatches(filtered.length);
  };

  const saveSegment = async () => {
    if (!name.trim()) return;

    setSaving(true);

    await addDoc(collection(db, "lists", listId, "segments"), {
      name,
      mode,
      conditions,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setSaving(false);
    onClose();
  };

  if (loading) return <div className="SegmentModal__loading">Cargando...</div>;

  return (
    <div className="SegmentModal__overlay">
      <div className="SegmentModal__box">

        <h2 className="SegmentModal__title">Crear segmento</h2>

        <label className="SegmentModal__label">
          Nombre del segmento ({name.length}/128)
        </label>
        <input
          type="text"
          maxLength={128}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="SegmentModal__input"
        />

        <label className="SegmentModal__label">Enviar a los que cumplan</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="SegmentModal__select"
        >
          <option value="any">Cualquiera de las condiciones</option>
          <option value="all">Todas las condiciones</option>
        </select>

        <div className="SegmentModal__conditions">
          {conditions.map((cond, i) => (
            <div key={i} className="SegmentModal__conditionRow">

              <select
                className="SegmentModal__select"
                value={cond.field}
                onChange={(e) => updateCondition(i, "field", e.target.value)}
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>

              <select
                className="SegmentModal__select"
                value={cond.operator}
                onChange={(e) => updateCondition(i, "operator", e.target.value)}
              >
                {TEXT_OPERATORS.map((op) => (
                  <option key={op.id} value={op.id}>{op.label}</option>
                ))}
              </select>

              <input
                className="SegmentModal__input"
                type="text"
                value={cond.value}
                onChange={(e) => updateCondition(i, "value", e.target.value)}
              />

              <button
                className="SegmentModal__delete"
                onClick={() => removeCondition(i)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button className="SegmentModal__add" onClick={addCondition}>
          + Añadir condición
        </button>

        <button className="SegmentModal__recalc" onClick={recalc}>
          Recalcular
        </button>

        {matches !== null && (
          <p className="SegmentModal__matches">
            Estas condiciones coinciden con <strong>{matches}</strong> suscriptores.
          </p>
        )}

        <div className="SegmentModal__actions">
          <button className="SegmentModal__cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="SegmentModal__save"
            onClick={saveSegment}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Crear segmento"}
          </button>
        </div>

      </div>
    </div>
  );
}
