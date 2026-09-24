import { Link } from "react-router-dom";
import "./ResourceCard.styles.css";

export default function ResourceCard({ to, image, title, description }) {
  return (
    <Link to={to} className="ResourceCard">
      <div className="ResourceCard__imageWrapper">
        <img src={image} alt={title} className="ResourceCard__image" />
      </div>

      <div className="ResourceCard__content">
        {/* TÍTULO ELIMINADO */}
        {/* <h3 className="ResourceCard__title">{title}</h3> */}

        <p className="ResourceCard__description">{description}</p>
      </div>
    </Link>
  );
}
