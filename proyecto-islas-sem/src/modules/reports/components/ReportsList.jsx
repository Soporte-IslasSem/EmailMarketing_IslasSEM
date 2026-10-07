import "./ReportsList.styles.css";
import { reportMetrics } from "../reportMetrics";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

// Firestore
import { db } from "../../../config/firebaseConfig";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "../../../shared/hooks/useAuth";

// PDF
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { toBase64 } from "../../../utils/toBase64";
import logo from "../../../assets/logos/islas-sem-logo.png";

// Cargar fuentes PDF
if (pdfFonts?.pdfMake?.vfs) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
} else if (pdfFonts?.vfs) {
  pdfMake.vfs = pdfFonts.vfs;
}

export default function ReportsList() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [logoBase64, setLogoBase64] = useState(null);

  // Convertir logo a Base64 al montar el componente
  useState(() => {
    toBase64(logo, (data) => setLogoBase64(data));
  }, []);

  // Cargar informes reales del usuario
  useEffect(() => {
    if (!user) {
      setReports([]);
      return;
    }

    const q = query(
      collection(db, "reports"),
      where("ownerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setReports(data);
    });

    return () => unsubscribe();
  }, [user]);

  const filtered = reports
    .filter((r) => (r.campaignName || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.sentAt?.seconds || b.lastSentAt?.seconds || 0) - (a.sentAt?.seconds || a.lastSentAt?.seconds || 0));

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  const formatDate = (timestamp) =>
    timestamp?.seconds
      ? new Date(timestamp.seconds * 1000).toLocaleString()
      : "—";

  // ----------------------------------------------------
  // DESCARGAR INFORME GLOBAL
  // ----------------------------------------------------
  const handleDownloadGlobal = () => {
    // Si hay informes marcados, el global se hace solo con esos.
    const pool = selected.length ? filtered.filter((r) => selected.includes(r.id)) : filtered;
    if (!pool.length || !logoBase64) return;

    const sum = pool.map(reportMetrics).reduce(
      (a, m) => ({ sent: a.sent + m.sent, opened: a.opened + m.opened, clicked: a.clicked + m.clicked }),
      { sent: 0, opened: 0, clicked: 0 }
    );
    const totalSent = sum.sent;

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
              text: "Informe global de campañas",
              style: "header",
              alignment: "right",
            },
          ],
        },
        { text: `Fecha: ${new Date().toLocaleString()}`, margin: [0, 0, 0, 20] },
        {
          columns: [
            { text: `Enviados: ${totalSent}`, style: "stat" },
            { text: `Abiertos: ${sum.opened}`, style: "stat" },
            { text: `Clics: ${sum.clicked}`, style: "stat" },
          ],
        },
        {
          margin: [0, 20, 0, 0],
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto"],
            body: [
              ["Campaña", "Enviados", "Abiertos", "Clics"],
              ...pool.map((r) => {
                const m = reportMetrics(r);
                return [r.campaignName || "—", String(m.sent), `${m.opened} (${m.openRate}%)`, `${m.clicked} (${m.clickRate}%)`];
              }),
            ],
          },
        },
      ],
      styles: {
        header: { fontSize: 22, bold: true, color: "#00796B", margin: [0, 0, 0, 10] },
        stat: { fontSize: 14, bold: true },
      },
    };

    pdfMake.createPdf(docDefinition).download("informe_global.pdf");
  };

  // ----------------------------------------------------
  // DESCARGAR INFORME INDIVIDUAL (PDF)
  // ----------------------------------------------------
  const handleDownloadIndividual = (report) => {
    if (!logoBase64) return;
    const m = reportMetrics(report);

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
        { text: `Campaña: ${report.campaignName}`, style: "subheader" },
        { text: `Fecha: ${formatDate(report.sentAt)}`, margin: [0, 0, 0, 20] },
        {
          columns: [
            { text: `Enviados: ${m.sent}`, style: "stat" },
            { text: `Abiertos: ${m.opened} (${m.openRate}%)`, style: "stat" },
            { text: `Clics: ${m.clicked} (${m.clickRate}%)`, style: "stat" },
          ],
        },
      ],
      styles: {
        header: { fontSize: 22, bold: true, color: "#00796B", margin: [0, 0, 0, 10] },
        subheader: { fontSize: 16, margin: [0, 0, 0, 10] },
        stat: { fontSize: 14, bold: true },
      },
    };

    pdfMake
      .createPdf(docDefinition)
      .download(`informe_${report.campaignName || "campaña"}.pdf`);
  };

  return (
    <div className="CampaignReports">
      <h1 className="CampaignReports__title">Informes</h1>
      <p className="CampaignReports__subtitle">
        Consulta las estadísticas que han generado tus campañas.
      </p>

      <div className="CampaignReports__topbar">
        <input
          type="text"
          placeholder="Buscar informe"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="CampaignReports__search"
        />

        <button
          className="CampaignReports__download"
          onClick={handleDownloadGlobal}
        >
          {selected.length ? `Descargar informe (${selected.length})` : "Descargar informe global"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="CampaignReports__empty">
          <h3>No hay informes disponibles todavía.</h3>
          <p>Envía una campaña para ver sus resultados aquí.</p>
        </div>
      ) : (
        <table className="CampaignReports__table">
          <thead>
            <tr>
              <th></th>
              <th>Nombre</th>
              <th>Fecha envío</th>
              <th>Emails</th>
              <th>Abiertos</th>
              <th>Clics</th>
              <th>Imprimir</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => {
              const m = reportMetrics(r);
              return (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                </td>

                <td>
                  <Link to={`/dashboard/reports/${r.id}`}>
                    {r.campaignName}
                  </Link>
                </td>

                <td>{formatDate(r.sentAt)}</td>

                <td>{m.sent}</td>
                <td>{m.opened} <small className="CampaignReports__pct">{m.openRate}%</small></td>
                <td>{m.clicked} <small className="CampaignReports__pct">{m.clickRate}%</small></td>

                <td>
                  <button
                    className="CampaignReports__print"
                    onClick={() => handleDownloadIndividual(r)}
                  >
                    🖨️
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
