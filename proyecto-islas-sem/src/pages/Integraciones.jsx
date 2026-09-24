import React from "react";
import Header from "../modules/home/components/Header/Header";
import Footer from "../modules/home/components/Footer/Footer";
import "./Integraciones.styles.css";

export default function Integraciones() {
  return (
    <>
      <Header />

      <section className="integraciones-hero">
        <h1>Integraciones</h1>
        <p>
          Conecta ISLAS SEM con tus herramientas favoritas y automatiza tu
          flujo de trabajo.
        </p>
      </section>

      <section className="integraciones-grid">
        <article className="integration-card">
          <h3>Google Sheets</h3>
          <p>Importa y sincroniza tus contactos directamente desde tus hojas.</p>
        </article>

        <article className="integration-card">
          <h3>Mailchimp</h3>
          <p>Migra tus listas y campañas sin complicaciones.</p>
        </article>

        <article className="integration-card">
          <h3>CoverManager</h3>
          <p>Sincroniza reservas y clientes automáticamente.</p>
        </article>

        <article className="integration-card">
          <h3>API REST</h3>
          <p>Conecta cualquier sistema externo mediante nuestra API.</p>
        </article>
      </section>

      <Footer />
    </>
  );
}
