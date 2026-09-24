import "./TestimonialsSection.styles.css";
import { testimonialsBySegment } from "../../../../data/testimonials";

// Importamos TODOS los avatares ficticios
import cristina from "../../../../assets/testimonials/cristina-lang-lenton.png";
import tazarte from "../../../../assets/testimonials/tazarte.png";
import oliver from "../../../../assets/testimonials/oliver-solis.png";
import mariaDelgado from "../../../../assets/testimonials/maria-delgado.png";
import garelle from "../../../../assets/testimonials/garelle-hernandez.png";
import lm from "../../../../assets/testimonials/lm.png";

export default function TestimonialsSection() {
  // Convertimos el objeto en un array plano de testimonios
  const allTestimonials = Object.values(testimonialsBySegment).flat();

  // Mapeo entre persona → avatar ficticio
  const avatarMap = {
    "Cristina Lang-lenton": cristina,
    "Tazarte": tazarte,
    "Oliver Solís": oliver,
    "María Delgado": mariaDelgado,
    "Garelle Hernández": garelle,
    "L.M.": lm,
  };

  return (
    <section className="TestimonialsSection">
      <div className="TestimonialsSection__container">
        <h2 className="TestimonialsSection__title">
          Lo que dicen quienes confían en nosotros
        </h2>

        <div className="TestimonialsSection__grid">
          {allTestimonials.map((t, index) => (
            <div key={index} className="TestimonialsSection__card">
              <p className="TestimonialsSection__text">“{t.text}”</p>

              <div className="TestimonialsSection__footer">
                <img
                  src={avatarMap[t.person]}
                  alt={t.person}
                  className="TestimonialsSection__logo"
                  loading="lazy"
                />
                <span className="TestimonialsSection__person">{t.person}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
