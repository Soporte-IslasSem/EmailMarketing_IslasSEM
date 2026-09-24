import { useState } from "react";
import { addDoc, updateDoc, doc, collection } from "firebase/firestore";
import { db } from "../../../../../config/firebaseConfig";
import "./CreateOrEditFieldModal.styles.css";

export default function CreateOrEditFieldModal({ listId, field, onClose }) {
  const isEditing = Boolean(field);

  const [name, setName] = useState(field?.label || "");
  const [type, setType] = useState(field?.type || "text");
  const [visibility, setVisibility] = useState(
    field?.visible === false ? "hidden" : "editable"
  );

  const [options, setOptions] = useState(field?.options || []);
  const [multiple, setMultiple] = useState(field?.multiple || false);

  const addOption = () => setOptions([...options, ""]);

  const updateOption = (index, value) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const removeOption = (index) => {
    const updated = options.filter((_, i) => i !== index);
    setOptions(updated);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert("El nombre del campo es obligatorio");
      return;
    }

    const data = {
      label: name,
      type,
      visible: visibility === "editable",
      tag: `*|${name.toUpperCase()}|*`,
    };

    if (type === "list") {
      data.options = options;
      data.multiple = multiple;
    }

    if (isEditing) {
      await updateDoc(doc(db, "lists", listId, "fields", field.id), data);
    } else {
      await addDoc(collection(db, "lists", listId, "fields"), data);
    }

    onClose();
  };

  return (
    <div className="FieldModal__overlay">
      <div className="FieldModal__box">

        <h3 className="FieldModal__title">
          {isEditing ? "Editar campo" : "Añadir campo"}
        </h3>

        <div className="FieldModal__content">

          <label className="FieldModal__label">Nombre del campo</label>
          <input
            className="FieldModal__input"
            type="text"
            placeholder="Ej: nombre, ciudad, edad..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className="FieldModal__label">Tipo de campo</label>
          <select
            className="FieldModal__select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="text">Texto</option>
            <option value="checkbox">Checkbox</option>
            <option value="list">Lista</option>
            <option value="integer">Número entero</option>
            <option value="decimal">Número decimal</option>
            <option value="date">Fecha</option>
            <option value="longtext">Texto largo</option>
            <option value="ip">IP</option>
            <option value="url">URL</option>
          </select>

          {/* BLOQUE LISTA */}
          {type === "list" && (
            <div className="FieldModal__listBlock">
              <label className="FieldModal__label">Opciones de la lista</label>

              {options.map((opt, index) => (
                <div key={index} className="FieldModal__listOption">
                  <input
                    className="FieldModal__input"
                    type="text"
                    value={opt}
                    placeholder={`Opción ${index + 1}`}
                    onChange={(e) => updateOption(index, e.target.value)}
                  />
                  <button
                    className="delete-option"
                    onClick={() => removeOption(index)}
                  >
                    Eliminar
                  </button>
                </div>
              ))}

              <button className="add-option" onClick={addOption}>
                Añadir opción
              </button>

              <div className="FieldModal__toggle">
                <span>Permitir varias opciones</span>
                <input
                  type="checkbox"
                  checked={multiple}
                  onChange={() => setMultiple(!multiple)}
                />
              </div>
            </div>
          )}

          <label className="FieldModal__label">Visibilidad</label>
          <div className="FieldModal__visibility">
            <label className="FieldModal__radioLabel">
              <input
                className="FieldModal__radio"
                type="radio"
                value="editable"
                checked={visibility === "editable"}
                onChange={() => setVisibility("editable")}
              />
              Visible y editable
            </label>

            <label className="FieldModal__radioLabel">
              <input
                className="FieldModal__radio"
                type="radio"
                value="hidden"
                checked={visibility === "hidden"}
                onChange={() => setVisibility("hidden")}
              />
              Oculto
            </label>
          </div>
        </div>

        <div className="FieldModal__actions">
          <button className="cancel" onClick={onClose}>Cancelar</button>
          <button className="save" onClick={handleSave}>
            {isEditing ? "Guardar cambios" : "Añadir campo"}
          </button>
        </div>

      </div>
    </div>
  );
}
