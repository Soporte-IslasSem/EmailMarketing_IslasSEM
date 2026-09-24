// src/data/systemTemplates.js
// Plantillas HTML editables para GrapesJS — ISLAS SEM

export const systemTemplates = [
  // Bienvenida profesional
  {
    id: "welcome-1",
    title: "Bienvenida profesional",
    image: "/assets/templates/system/welcome.png",
    html: `
      <div class="email-wrapper" style="background:#ffffff;padding:40px;font-family:Inter,sans-serif;">
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;text-align:center;">
            <img src="/assets/templates/system/welcome.png" alt="Bienvenida profesional" style="width:100%;max-width:280px;border-radius:8px;" />
          </div>
          <div style="flex:2;text-align:left;">
            <h1 style="color:#000;font-size:28px;margin-bottom:12px;">
              Bienvenido a <span style="color:#1A9190;">ISLAS SEM</span>
            </h1>
            <p style="font-size:16px;color:#333;margin-bottom:8px;">
              Gracias por unirte a nuestra comunidad.
            </p>
            <p style="font-size:16px;color:#333;margin-bottom:20px;">
              Estamos encantados de tenerte con nosotros.
            </p>
            <a href="#" style="
              display:inline-block;
              padding:12px 20px;
              background:#1A9190;
              color:white;
              text-decoration:none;
              border-radius:6px;
              font-weight:600;
            ">
              Explorar plataforma
            </a>
          </div>
        </div>
        <div style="text-align:center;padding-top:30px;font-size:14px;color:#777;">
          <p>Si necesitas ayuda, estamos aquí para apoyarte.</p>
        </div>
      </div>
    `,
    tags: ["bienvenida", "onboarding"],
  },

  // 🟢 Promoción destacada
  {
    id: "promo-1",
    title: "Promoción destacada",
    image: "/assets/templates/system/promo.png",
    html: `
      <div class="email-wrapper" style="background:#ffffff;padding:40px;font-family:Inter,sans-serif;">
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;text-align:center;">
            <img src="/assets/templates/system/promo.png" alt="Promoción destacada" style="width:100%;max-width:280px;border-radius:8px;" />
          </div>
          <div style="flex:2;text-align:left;">
            <h1 style="color:#1A9190;font-size:28px;margin-bottom:12px;">Promoción destacada</h1>
            <p style="font-size:16px;color:#333;margin-bottom:20px;">
              Aprovecha nuestro descuento exclusivo por tiempo limitado.
            </p>
            <a href="#" style="
              display:inline-block;
              padding:12px 20px;
              background:#1A9190;
              color:white;
              text-decoration:none;
              border-radius:6px;
              font-weight:600;
            ">
              Ver oferta
            </a>
          </div>
        </div>
        <div style="text-align:center;padding-top:30px;font-size:14px;color:#777;">
          <p>Oferta válida hasta fin de mes.</p>
        </div>
      </div>
    `,
    tags: ["promoción", "ventas"],
  },

  // 🟢 Newsletter moderna
  {
    id: "newsletter-1",
    title: "Newsletter moderna",
    image: "/assets/templates/system/newsletter.png",
    html: `
      <div class="email-wrapper" style="background:#ffffff;padding:40px;font-family:Inter,sans-serif;">
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;text-align:center;">
            <img src="/assets/templates/system/newsletter.png" alt="Newsletter moderna" style="width:100%;max-width:280px;border-radius:8px;" />
          </div>
          <div style="flex:2;text-align:left;">
            <h1 style="color:#000;font-size:26px;margin-bottom:12px;">Newsletter moderna</h1>
            <p style="font-size:16px;color:#333;margin-bottom:12px;">
              Te traemos las novedades más importantes del sector.
            </p>
            <ul style="color:#333;font-size:15px;padding-left:20px;margin:0;">
              <li>Nueva actualización de producto</li>
              <li>Eventos próximos</li>
              <li>Consejos y recursos</li>
            </ul>
            <div style="margin-top:24px;">
              <a href="#" style="
                display:inline-block;
                padding:10px 18px;
                background:#1A9190;
                color:white;
                text-decoration:none;
                border-radius:6px;
                font-weight:600;
              ">
                Leer más
              </a>
            </div>
          </div>
        </div>
      </div>
    `,
    tags: ["newsletter"],
  },

  // 🟢 Solicitud de feedback
  {
    id: "feedback-1",
    title: "Solicitud de feedback",
    image: "/assets/templates/system/feedback.png",
    html: `
      <div class="email-wrapper" style="background:#ffffff;padding:40px;font-family:Inter,sans-serif;">
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;text-align:center;">
            <img src="/assets/templates/system/feedback.png" alt="Solicitud de feedback" style="width:100%;max-width:280px;border-radius:8px;" />
          </div>
          <div style="flex:2;text-align:left;">
            <h1 style="color:#000;font-size:26px;margin-bottom:12px;">¿Qué te ha parecido nuestra experiencia?</h1>
            <p style="font-size:16px;color:#333;margin-bottom:16px;">
              Tu opinión es muy importante para nosotros. Ayúdanos a mejorar respondiendo este breve formulario.
            </p>
            <a href="#" style="
              display:inline-block;
              padding:12px 20px;
              background:#1A9190;
              color:white;
              text-decoration:none;
              border-radius:6px;
              font-weight:600;
            ">
              Dar feedback
            </a>
          </div>
        </div>
        <div style="text-align:center;padding-top:24px;font-size:14px;color:#777;">
          <p>Solo te llevará unos minutos.</p>
        </div>
      </div>
    `,
    tags: ["feedback"],
  },
];
