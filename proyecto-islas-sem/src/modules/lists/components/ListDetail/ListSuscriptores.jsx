import { useParams } from "react-router-dom";
import SubscribersTable from "./SubscribersTable.jsx";
import ImportPreviewModal from "./ImportPreviewModal.jsx";

import { useList } from "../../hooks/useList.js";
import { useImportSubscribers } from "../../hooks/useImportSubscribers.js";

import ImportMethods from "../../components/ImportMethods.jsx";
import OtherSources from "../../components/OtherSources.jsx";
import Header from "../../components/Header.jsx";
import ErrorMessage from "../../components/ErrorMessage.jsx";

import "./ListSuscriptores.styles.css";

export default function ListSuscriptores() {
  const { id } = useParams();
  const { list, loadingList } = useList(id);

  // El hook SIEMPRE se ejecuta, aunque list aún sea null
  const importHook = useImportSubscribers(id, list);

  if (loadingList || !list) {
    return <p>Cargando...</p>;
  }

  const {
    method,
    setMethod,
    rawEmails,
    setRawEmails,
    updateExisting,
    setUpdateExisting,
    error,
    setError,
    previewData,
    setPreviewData,
    handleAdd,
    confirmImport,
    handleGoogleImport,
    resetUploaderKey,
  } = importHook;

  return (
    <div className="ListSuscriptores">
      <Header method={method} handleAdd={handleAdd} />

      <ImportMethods
        method={method}
        setMethod={setMethod}
        setError={setError}
        setRawEmails={setRawEmails}
        setUpdateExisting={setUpdateExisting}
        resetUploaderKey={resetUploaderKey}
      />

      <OtherSources
        onGoogleImport={handleGoogleImport}
        setRawEmails={setRawEmails}
        setMethod={setMethod}
      />

      <SubscribersTable listId={id} />

      {error && <ErrorMessage error={error} />}

      {previewData && (
        <ImportPreviewModal
          validEmails={previewData.validEmails}
          invalidEmails={previewData.invalidEmails}
          duplicateEmails={previewData.duplicateEmails}
          onConfirm={confirmImport}
          onCancel={() => setPreviewData(null)}
        />
      )}
    </div>
  );
}
