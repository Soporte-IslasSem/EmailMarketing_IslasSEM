import { useState } from "react";
import useLists from "../../hooks/useLists";
import "./CreateList.styles.css";

export default function CreateList() {
  const { createList } = useLists();
  const [name, setName] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    await createList(name);
    setName("");
    alert("Lista creada");
  };

  return (
    <div className="CreateList">
      <h1>Crear nueva lista</h1>

      <form onSubmit={handleSubmit} className="CreateList__form">
        <input
          type="text"
          placeholder="Nombre de la lista"
          className="CreateList__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button className="CreateList__button">Crear</button>
      </form>
    </div>
  );
}
