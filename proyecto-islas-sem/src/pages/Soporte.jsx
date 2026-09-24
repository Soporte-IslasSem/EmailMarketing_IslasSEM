import React from "react";
import Header from "../modules/home/components/Header/Header";
import Footer from "../modules/home/components/Footer/Footer";
import "./Soporte.styles.css";

export default function Soporte() {
  return (
    <>
      <Header />

      <section className="soporte-hero">
        <h1>Centro de Soporte</h1>
        <p>
          Encuentra respuestas, guías y asistencia personalizada para resolver
          cualquier duda.
        </p>
      </section>

      <section className="soporte-grid">
        <article className="soporte-card">
          <h3>Preguntas Frecuentes</h3>
          <p>Consulta las dudas más comunes sobre la plataforma.</p>
        </article>

        <article className="soporte-card">
          <h3>Documentación</h3>
          <p>Guías completas para aprender a usar cada módulo.</p>
        </article>

        <article className="soporte-card">
          <h3>API</h3>
          <p>Documentación técnica para desarrolladores.</p>
        </article>

        <article className="soporte-card">
          <h3>Contacto</h3>
          <p>¿Necesitas ayuda? Nuestro equipo está listo para asistirte.</p>
        </article>
      </section>

      <Footer />
    </>
  );
}
