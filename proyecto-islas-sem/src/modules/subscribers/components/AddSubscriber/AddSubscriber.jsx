import { useState } from "react";
import useSubscribers from "../../hooks/useSubscribers";
import "./AddSubscriber.styles.css";

export default function AddSubscriber({ listId }) {
  const { addSubscriber } = useSubscribers();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    await addSubscriber(email, name, listId);

    setEmail("");
    setName("");

    alert("Suscriptor añadido");
  };

  return (
    <div className="AddSubscriber">
      <h2>Añadir suscriptor</h2>

      <form onSubmit={handleSubmit} className="AddSubscriber__form">
        <input
          type="text"
          placeholder="Nombre"
          className="AddSubscriber__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          type="email"
          placeholder="Email"
          className="AddSubscriber__input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button className="AddSubscriber__button">Añadir</button>
      </form>
    </div>
  );
}
