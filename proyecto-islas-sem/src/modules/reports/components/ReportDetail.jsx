import "./ReportDetail.styles.css";
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";

// Firestore
import { db } from "../../../config/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

// PDF
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

// Asegurar que las fuentes se carguen correctamente
if (pdfFonts && pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
} else if (pdfFonts && pdfFonts.vfs) {
  pdfMake.vfs = pdfFonts.vfs;
}

// Logo ISLAS SEM
import logo from "../../../assets/logos/islas-sem-logo.png";

// Utilidad para convertir imágenes a Base64
import { toBase64 } from "../../../utils/toBase64";

// Componentes internos
import ReportTabs from "./ReportTabs";
import TabResumen from "./tabs/TabResumen";
import TabAvanzado from "./tabs/TabAvanzado";
import TabMapaClics from "./tabs/TabMapaClics";
import TabSeguimientoURLs from "./tabs/TabSeguimientoURLs";
import TabDetallesSuscriptores from "./tabs/TabDetallesSuscriptores";

export default function ReportDetail() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("resumen");

  // 🔹 Función para formatear fechas Firestore
  const formatDate = (dateObj) => {
    if (!dateObj) return "—";
    if (typeof dateObj === "string") return dateObj;
    if (dateObj.seconds) {
      return new Date(dateObj.seconds * 1000).toLocaleString();
    }
    return "—";
  };

  useEffect(() => {
    const loadReport = async () => {
      try {
        const ref = doc(db, "reports", id);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          const results = data.results || [];

          const totalSent = results.filter(r => r.status === "sent").length;
          const totalErrors = results.filter(r => r.status === "error").length;
          // Todavía no hay seguimiento de aperturas ni clics implementado
          const totalOpened = 0;
          const totalClicked = 0;

          setReport({
            id,
            ...data,
            results,
            totalSent,
            totalOpened,
            totalClicked,
            totalErrors,
          });
        } else {
          setReport(null);
        }
      } catch (error) {
        console.error("Error cargando informe:", error);
        setReport(null);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [id]);

  if (loading) {
    return (
      <div className="ReportDetail">
        <h1>Cargando informe...</h1>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="ReportDetail">
        <h1>Informe no encontrado</h1>
        <p>El informe solicitado no existe o fue eliminado.</p>
      </div>
    );
  }

  // ---------------------------
  // BOTÓN: VER EMAIL
  // ---------------------------
  const handleViewEmail = async () => {
    try {
      const ref = doc(db, "campaigns", id);
      const snap = await getDoc(ref);

      if (!snap.exists()) return;

      const html = snap.data().template?.html || "<p>No hay HTML guardado</p>";

      const win = window.open("", "_blank");
      win.document.write(html);
      win.document.close();
    } catch (err) {
      console.error("Error mostrando email:", err);
    }
  };

  // ---------------------------
  // BOTÓN: DESCARGAR PDF (ESTABLE)
  // ---------------------------
  const handleDownloadPDF = () => {
    if (!pdfMake || !pdfMake.createPdf) {
      console.error("pdfMake no está disponible.");
      return;
    }

    toBase64(logo, (logoBase64) => {
      const subs = report.results.map((r) => [
        r.email,
        r.status || "",
        "No", // apertura: sin seguimiento implementado todavía
        "No", // clic: sin seguimiento implementado todavía
        formatDate(report.sentAt),
        "—",
        "—",
      ]);

      const docDefinition = {
        footer: {
          columns: [
            {
              text: "ISLAS SEM – Cuidando tu negocio",
              alignment: "center",
              fontSize: 10,
              margin: [0, 10, 0, 0],
            },
          ],
        },

        content: [
          {
            columns: [
              {
                image: logoBase64,
                width: 100,
                margin: [0, 0, 10, 0],
              },
              {
                text: "Informe de campaña",
                style: "header",
                alignment: "right",
              },
            ],
          },

          { text: `Campaña: ${report.config?.campaignName}`, style: "subheader" },
          { text: `Fecha: ${new Date().toLocaleString()}`, margin: [0, 0, 0, 20] },

          {
            columns: [
              { text: `Enviados: ${report.totalSent}`, style: "stat" },
              { text: `Abiertos: ${report.totalOpened}`, style: "stat" },
              { text: `Clics: ${report.totalClicked}`, style: "stat" },
              { text: `Errores: ${report.totalErrors}`, style: "stat" },
            ],
            margin: [0, 0, 0, 20],
          },

          { text: "Detalle de suscriptores", style: "tableTitle" },

          {
            table: {
              headerRows: 1,
              widths: ["auto", "*", "auto", "auto", "auto", "auto", "auto"],
              body: [
                ["Email", "Estado", "Abierto", "Clic", "Enviado", "Apertura", "Clic"],
                ...subs,
              ],
            },
            layout: "lightHorizontalLines",
          },
        ],

        styles: {
          header: { fontSize: 22, bold: true, margin: [0, 0, 0, 10] },
          subheader: { fontSize: 16, margin: [0, 0, 0, 10] },
          stat: { fontSize: 14, bold: true },
          tableTitle: { fontSize: 16, bold: true, margin: [0, 20, 0, 10] },
        },
      };

      pdfMake.createPdf(docDefinition).download(`reporte_${id}.pdf`);
    });
  };

  const renderTab = () => {
    switch (activeTab) {
      case "resumen":
        return <TabResumen report={report} />;
      case "avanzado":
        return <TabAvanzado report={report} />;
      case "mapa":
        return <TabMapaClics report={report} />;
      case "urls":
        return <TabSeguimientoURLs report={report} />;
      case "suscriptores":
        return <TabDetallesSuscriptores report={report} />;
      default:
        return null;
    }
  };

  return (
    <div className="ReportDetail">
      <div className="ReportDetail__header">
        <div>
          <h1 className="ReportDetail__title">{report.config?.campaignName}</h1>
          <p className="ReportDetail__subtitle">
            Consulta las estadísticas que han generado tus campañas.
          </p>
        </div>

        <div className="ReportDetail__actions">
          <button className="ReportDetail__button" onClick={handleDownloadPDF}>
            Descargar PDF
          </button>

          <button
            className="ReportDetail__button secondary"
            onClick={handleViewEmail}
          >
            Ver email
          </button>
        </div>
      </div>

      <ReportTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="ReportDetail__content">{renderTab()}</div>
    </div>
  );
}
