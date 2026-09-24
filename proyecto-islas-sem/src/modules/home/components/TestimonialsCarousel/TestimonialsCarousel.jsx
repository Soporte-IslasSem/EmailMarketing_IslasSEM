import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import "./TestimonialsCarousel.styles.css";

export default function TestimonialsCarousel({ testimonials }) {
  return (
    <section className="Testimonials">
      <div className="Testimonials__container">

        <Swiper
          modules={[Pagination]}
          pagination={{ clickable: true }}
          spaceBetween={24}
          slidesPerView={1}
        >
          {testimonials.map((t, i) => (
            <SwiperSlide key={i}>
              <div className="Testimonials__card">
                <p className="Testimonials__text">“{t.text}”</p>
                <h4 className="Testimonials__person">{t.person}</h4>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

      </div>
    </section>
  );
}
