import React from "react";
import Header from "../modules/home/components/Header/Header";
import Footer from "../modules/home/components/Footer/Footer";
import "./Tarifas.styles.css";

export default function Tarifas() {
  return (
    <>
      <Header />

      <section className="tarifas-hero">
        <h1>Planes y Tarifas</h1>
        <p>
          Elige el plan que mejor se adapte a tu negocio. Sin permanencia y con
          soporte incluido.
        </p>
      </section>

      <section className="tarifas-grid">
        <article className="plan-card">
          <h3>Gratis</h3>
          <p className="price">0€/mes</p>
          <ul>
            <li>2.000 emails al mes</li>
            <li>Editor de plantillas</li>
            <li>Automatizaciones básicas</li>
          </ul>
          <button className="btn-primary">Empezar</button>
        </article>

        <article className="plan-card destacado">
          <h3>Profesional</h3>
          <p className="price">29€/mes</p>
          <ul>
            <li>20.000 emails al mes</li>
            <li>Automatizaciones avanzadas</li>
            <li>Soporte prioritario</li>
          </ul>
          <button className="btn-primary">Elegir plan</button>
        </article>

        <article className="plan-card">
          <h3>Empresas</h3>
          <p className="price">A medida</p>
          <ul>
            <li>Volumen ilimitado</li>
            <li>Integraciones personalizadas</li>
            <li>Gestor dedicado</li>
          </ul>
          <button className="btn-primary">Contactar</button>
        </article>
      </section>

      <Footer />
    </>
  );
}
