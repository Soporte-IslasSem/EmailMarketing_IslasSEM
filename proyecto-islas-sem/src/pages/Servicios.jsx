import React from "react";
import Header from "../modules/home/components/Header/Header";
import Footer from "../modules/home/components/Footer/Footer";
import "./Servicios.styles.css";

export default function Servicios() {
  return (
    <>
      <Header />

      <section className="servicios-hero">
        <h1>Servicios de ISLAS SEM</h1>
        <p>
          Todo lo que necesitas para crear, enviar y analizar tus campañas de
          email marketing, en un solo lugar.
        </p>
      </section>

      <section className="servicios-grid">
        <article className="servicio-card">
          <div className="servicio-icon email"></div>
          <h3>Campañas de Email</h3>
          <p>
            Envía campañas profesionales, segmenta tu audiencia y mide el
            rendimiento en tiempo real.
          </p>
        </article>

        <article className="servicio-card">
          <div className="servicio-icon sms"></div>
          <h3>Listas y Segmentación</h3>
          <p>
            Organiza a tus suscriptores en listas y segmentos para llegar
            siempre al público correcto.
          </p>
        </article>

        <article className="servicio-card">
          <div className="servicio-icon landing"></div>
          <h3>Plantillas y Editor Visual</h3>
          <p>
            Diseña emails a golpe de clic con nuestro editor de arrastrar y
            soltar, sin tocar código.
          </p>
        </article>

        <article className="servicio-card">
          <div className="servicio-icon automation"></div>
          <h3>Automatizaciones</h3>
          <p>
            Configura flujos inteligentes para mejorar la retención y aumentar
            tus ventas.
          </p>
        </article>
      </section>

      <section className="servicios-cta">
        <h2>Empieza gratis hoy</h2>
        <p>
          Crea tu cuenta y envía hasta 2.000 emails al mes sin coste. No
          necesitas tarjeta de crédito.
        </p>
        <button className="btn-primary">Crear cuenta</button>
      </section>

      <Footer />
    </>
  );
}
