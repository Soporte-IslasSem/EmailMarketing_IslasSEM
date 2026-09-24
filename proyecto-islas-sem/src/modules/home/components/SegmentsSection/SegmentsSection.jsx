import "./SegmentsSection.styles.css";
import { testimonialsBySegment } from "../../../../data/testimonials";

// Importamos los avatares ficticios
import cristina from "../../../../assets/testimonials/cristina-lang-lenton.png";
import oliver from "../../../../assets/testimonials/oliver-solis.png";
import garelle from "../../../../assets/testimonials/garelle-hernandez.png";
import lm from "../../../../assets/testimonials/lm.png";

export default function SegmentsSection() {
  const segments = [
    { key: "pymes", label: "Pymes" },
    { key: "enterprise", label: "Enterprise" },
    { key: "agencies", label: "Agencias" },
    { key: "institutions", label: "Instituciones" }
  ];

  // Mapeo entre persona → avatar ficticio
  const avatarMap = {
    "Cristina Lang-lenton": cristina,
    "Oliver Solís": oliver,
    "Garelle Hernández": garelle,
    "L.M.": lm
  };

  return (
    <section className="SegmentsSection">
      <div className="SegmentsSection__container">
        <h2 className="SegmentsSection__title">
          Soluciones adaptadas a cada tipo de organización
        </h2>

        <div className="SegmentsSection__grid">
          {segments.map((segment) => {
            const testimonial = testimonialsBySegment[segment.key][0];

            return (
              <div key={segment.key} className="SegmentsSection__card">
                <h3 className="SegmentsSection__cardTitle">{segment.label}</h3>

                <p className="SegmentsSection__text">{testimonial.text}</p>

                <div className="SegmentsSection__footer">
                  <img
                    src={avatarMap[testimonial.person]}
                    alt={testimonial.person}
                    className="SegmentsSection__logo"
                    loading="lazy"
                  />
                  <span className="SegmentsSection__person">
                    {testimonial.person}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
