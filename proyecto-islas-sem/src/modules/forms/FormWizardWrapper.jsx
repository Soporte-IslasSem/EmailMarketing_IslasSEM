import { useParams } from "react-router-dom";
import FormWizard from "./components/FormWizard.jsx";

export default function FormWizardWrapper({ isNew }) {
  const { id, formId } = useParams();

  return (
    <FormWizard
      listId={id}
      initialFormId={isNew ? null : formId}
    />
  );
}
