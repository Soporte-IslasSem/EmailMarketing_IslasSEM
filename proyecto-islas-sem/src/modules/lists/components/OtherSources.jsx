import { useState } from "react";

import MailchimpModal from "./ListDetail/modals/MailchimpModal.jsx";
import GoogleSheetsModal from "./ListDetail/modals/GoogleSheetsModal.jsx";
import CoverManagerModal from "./ListDetail/modals/CoverManagerModal.jsx";

export default function OtherSources({ onGoogleImport, setRawEmails, setMethod }) {
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState(null);

  return (
    <>
      <div className="import-other-wrapper">
        {!show ? (
          <button className="import-other-sources" onClick={() => setShow(true)}>
            Importar desde otras fuentes
          </button>
        ) : (
          <button className="import-other-sources" onClick={() => setShow(false)}>
            Ocultar importación desde otras fuentes
          </button>
        )}
      </div>

      {show && (
        <div className="OtherSourcesPanel">
          <div className="source-item" onClick={() => setSelected("mailchimp")}>
            <input type="radio" checked={selected === "mailchimp"} readOnly />
            <div>
              <h4>Mailchimp</h4>
              <p>Importa tus listas desde Mailchimp</p>
            </div>
          </div>

          <div className="source-item" onClick={() => setSelected("sheets")}>
            <input type="radio" checked={selected === "sheets"} readOnly />
            <div>
              <h4>Google Sheets</h4>
              <p>Importa tus suscriptores desde Google Sheets</p>
            </div>
          </div>

          <div className="source-item" onClick={() => setSelected("covermanager")}>
            <input type="radio" checked={selected === "covermanager"} readOnly />
            <div>
              <h4>CoverManager</h4>
              <p>Importa tus clientes desde CoverManager</p>
            </div>
          </div>
        </div>
      )}

      {selected === "mailchimp" && (
        <MailchimpModal
          onClose={() => setSelected(null)}
          onImport={(emails) => {
            setRawEmails(emails);
            setMethod("text");
          }}
        />
      )}

      {selected === "sheets" && (
        <GoogleSheetsModal
          onClose={() => setSelected(null)}
          onImport={onGoogleImport}
        />
      )}

      {selected === "covermanager" && (
        <CoverManagerModal
          onClose={() => setSelected(null)}
          onImport={(emails) => {
            setRawEmails(emails);
            setMethod("text");
          }}
        />
      )}
    </>
  );
}
