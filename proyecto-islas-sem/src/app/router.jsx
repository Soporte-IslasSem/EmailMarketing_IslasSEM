import { createBrowserRouter } from "react-router-dom";

// Layouts
import DashboardLayout from "../modules/dashboard/layout/DashboardLayout.jsx";
import AuthLayout from "../modules/dashboard/layout/AuthLayout/AuthLayout.jsx";

// Home
import Home from "../modules/home/pages/Home.jsx";

// Auth
import Login from "../modules/auth/pages/Login/Login.jsx";
import Register from "../modules/auth/pages/Register/Register.jsx";
import ForgotPassword from "../modules/auth/pages/ForgotPassword/ForgotPassword.jsx";
import ResetPassword from "../modules/auth/pages/ResetPassword/ResetPassword.jsx";

// Dashboard Home
import DashboardHome from "../modules/dashboard/components/DashboardHome/DashboardHome.jsx";
import Automations from "../modules/automations/Automations.jsx";

// Campaigns
import Campaigns from "../modules/campaigns/components/Campaigns/Campaigns.jsx";
import CreateCampaign from "../modules/campaigns/components/CreateCampaign/CreateCampaign.jsx";
import EditCampaign from "../modules/campaigns/components/EditCampaign/EditCampaign.jsx";

// Wizard Steps (Campaigns)
import StepConfig from "../modules/campaigns/components/Wizard/StepConfig.jsx";
import StepLists from "../modules/campaigns/components/Wizard/StepLists.jsx";
import StepTemplates from "../modules/campaigns/components/Wizard/StepTemplates.jsx";
import StepDesign from "../modules/campaigns/components/Wizard/StepDesign.jsx";
import StepSend from "../modules/campaigns/components/Wizard/StepSend.jsx";

// Lists
import Lists from "../modules/lists/components/Lists/Lists.jsx";
import CreateList from "../modules/lists/components/CreateList/CreateList.jsx";
import ListDetail from "../modules/lists/components/ListDetail/ListDetail.jsx";

// ListDetail submodules
import ListResumen from "../modules/lists/components/ListDetail/ListResumen.jsx";
import ListSuscriptores from "../modules/lists/components/ListDetail/ListSuscriptores.jsx";
import ListCampos from "../modules/lists/components/ListDetail/ListCampos.jsx";
import ListFormularios from "../modules/lists/components/ListDetail/ListFormularios.jsx";
import ListSegmentos from "../modules/lists/components/segments/ListSegmentos.jsx";
import ListAjustes from "../modules/lists/components/ListDetail/ListAjustes.jsx";
import ListNotificaciones from "../modules/lists/components/ListDetail/ListNotificaciones.jsx";
import ListAudiencias from "../modules/lists/components/ListDetail/ListAudiencias.jsx";
import ListHerramientas from "../modules/lists/components/ListDetail/ListHerramientas.jsx";

// NOTIFICACIONES (subpantallas internas)
import ListNotificacionesGeneral from "../modules/lists/components/ListDetail/notifications/ListNotificacionesGeneral.jsx";
import ListNotificacionesConfirmEmail from "../modules/lists/components/ListDetail/notifications/ListNotificacionesConfirmEmail.jsx";
import ListNotificacionesConfirmPage from "../modules/lists/components/ListDetail/notifications/ListNotificacionesConfirmPage.jsx";
import ListNotificacionesUnsubscribe from "../modules/lists/components/ListDetail/notifications/ListNotificacionesUnsubscribe.jsx";

// Templates
import Templates from "../modules/templates/components/Templates/Templates.jsx";
import CreateTemplate from "../modules/templates/components/CreateTemplate/CreateTemplate.jsx";
import TemplateEditor from "../modules/templates/components/TemplateEditor/TemplateEditor.jsx";
import TemplateTagsPage from "../modules/templates/pages/TemplateTagsPage.jsx";

// Subscribers
import AddSubscriber from "../modules/subscribers/components/AddSubscriber/AddSubscriber.jsx";

// FORMS WIZARD

// NUEVO: listado y detalle de formularios

// REPORTES (NUEVOS)
import ReportsList from "../modules/reports/components/ReportsList.jsx";
import ReportDetail from "../modules/reports/components/ReportDetail.jsx";

// CRM (nuevo módulo)
import Contacts from "../modules/crm/pages/Contacts.jsx";
import ContactDetail from "../modules/crm/pages/ContactDetail.jsx";
import DealDetail from "../modules/crm/pages/DealDetail.jsx";
import Analytics from "../modules/crm/pages/Analytics.jsx";
import Products from "../modules/crm/pages/Products.jsx";
import Employees from "../modules/crm/pages/Employees.jsx";
import SalesDocs from "../modules/crm/pages/SalesDocs.jsx";
import Departments from "../modules/crm/pages/Departments.jsx";
import SalesTeams from "../modules/crm/pages/SalesTeams.jsx";
import Roles from "../modules/crm/pages/Roles.jsx";
import Integrations from "../modules/crm/pages/Integrations.jsx";
import CrmAutomation from "../modules/crm/pages/CrmAutomation.jsx";
import Audit from "../modules/crm/pages/Audit.jsx";
import Calendar from "../modules/crm/pages/Calendar.jsx";
import NewDeal from "../modules/crm/pages/NewDeal.jsx";
import Companies from "../modules/crm/pages/Companies.jsx";
import CompanyDetail from "../modules/crm/pages/CompanyDetail.jsx";
import Leads from "../modules/crm/pages/Leads.jsx";
import Pipeline from "../modules/crm/pages/Pipeline.jsx";
import Activities from "../modules/crm/pages/Activities.jsx";
import Outbox from "../modules/crm/pages/Outbox.jsx";
import CrmForms from "../modules/crm/pages/CrmForms.jsx";
import CrmFormBuilder from "../modules/crm/pages/CrmFormBuilder.jsx";
import CrmSettings from "../modules/crm/pages/CrmSettings.jsx";
import RecycleBin from "../modules/crm/pages/RecycleBin.jsx";
import History from "../modules/crm/pages/History.jsx";

// RECURSOS (público)
import Blog from "../pages/Blog.jsx";
import Glosario from "../pages/Glosario.jsx";
import OtrosRecursos from "../pages/OtrosRecursos.jsx";
import HerramientasGratuitas from "../pages/HerramientasGratuitas.jsx";

// FORMULARIOS PÚBLICOS (SEPA / Datos Jurídicos)
import PublicForm from "../modules/forms/public/PublicForm.jsx";
import ClientArea from "../modules/forms/public/ClientArea.jsx";

// NUEVAS PÁGINAS PÚBLICAS
import Servicios from "../pages/Servicios.jsx";
import Tarifas from "../pages/Tarifas.jsx";
import Integraciones from "../pages/Integraciones.jsx";
import Soporte from "../pages/Soporte.jsx";

const router = createBrowserRouter([
  // PUBLIC ROUTES
  {
    path: "/",
    element: <Home />,
  },

  // RECURSOS
  { path: "/blog", element: <Blog /> },
  { path: "/glosario", element: <Glosario /> },
  { path: "/otros-recursos", element: <OtrosRecursos /> },
  { path: "/herramientas-gratuitas", element: <HerramientasGratuitas /> },

  // FORMULARIOS PÚBLICOS RELLENABLES (sin login): /f/sepa/:dealId , /f/juridicos/:dealId
  { path: "/f/:formType", element: <PublicForm /> },
  { path: "/f/:formType/:dealId", element: <PublicForm /> },
  // Página pública de clientela: un botón por cada formulario publicado.
  { path: "/clientela", element: <ClientArea /> },

  // NUEVAS PÁGINAS PÚBLICAS
  { path: "/servicios", element: <Servicios /> },
  { path: "/tarifas", element: <Tarifas /> },
  { path: "/integraciones", element: <Integraciones /> },
  { path: "/soporte", element: <Soporte /> },

  // AUTH
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login", element: <Login /> },
      { path: "register", element: <Register /> },
      { path: "forgot-password", element: <ForgotPassword /> },
      { path: "reset-password", element: <ResetPassword /> },
    ],
  },

  // DASHBOARD
  {
    path: "/dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <DashboardHome /> },

      // CAMPAIGNS
      { path: "campaigns", element: <Campaigns /> },
      { path: "campaigns/create", element: <CreateCampaign /> },

      // WIZARD
      { path: "campaigns/create/config", element: <StepConfig /> },
      { path: "campaigns/create/lists", element: <StepLists /> },
      { path: "campaigns/create/templates", element: <StepTemplates /> },
      { path: "campaigns/create/design", element: <StepDesign /> },
      { path: "campaigns/create/send", element: <StepSend /> },
      { path: "campaigns/edit/:id", element: <EditCampaign /> },

      // REPORTES
      { path: "reports", element: <ReportsList /> },
      { path: "reports/:id", element: <ReportDetail /> },

      // CRM
      { path: "crm/contacts", element: <Contacts /> },
      { path: "crm/contacts/:id", element: <ContactDetail /> },
      { path: "crm/companies", element: <Companies /> },
      { path: "crm/companies/:id", element: <CompanyDetail /> },
      { path: "crm/leads", element: <Leads /> },
      { path: "crm/pipeline", element: <Pipeline /> },
      { path: "crm/newdeal", element: <NewDeal /> },
      { path: "crm/deals/:id", element: <DealDetail /> },
      { path: "crm/automation", element: <CrmAutomation /> },
      { path: "crm/activities", element: <Activities /> },

      // CRM · pestañas en construcción (mismo nav que el prototipo)
      { path: "crm/analytics", element: <Analytics /> },
      { path: "crm/outbox", element: <Outbox /> },
      { path: "crm/forms", element: <CrmForms /> },
      { path: "crm/forms/new", element: <CrmFormBuilder /> },
      { path: "crm/forms/edit/:id", element: <CrmFormBuilder /> },
      { path: "crm/quotes", element: <SalesDocs type="quotes" /> },
      { path: "crm/invoices", element: <SalesDocs type="invoices" /> },
      { path: "crm/products", element: <Products /> },
      { path: "crm/history", element: <History /> },
      { path: "crm/recyclebin", element: <RecycleBin /> },
      { path: "crm/settings", element: <CrmSettings /> },

      // Tareas
      { path: "tasks", element: <Activities /> },
      { path: "tasks/calendar", element: <Calendar /> },

      // Administración
      { path: "admin/team", element: <Employees /> },
      { path: "admin/departments", element: <Departments /> },
      { path: "admin/salesteams", element: <SalesTeams /> },
      { path: "admin/roles", element: <Roles /> },
      { path: "admin/integraciones", element: <Integrations /> },
      { path: "admin/audit", element: <Audit /> },

      // AUTOMATIZACIONES
      { path: "automations", element: <Automations /> },

      // LISTS
      { path: "lists", element: <Lists /> },
      { path: "lists/create", element: <CreateList /> },

      {
        path: "lists/:id",
        element: <ListDetail />,
        children: [
          { index: true, element: <ListResumen /> },
          { path: "suscriptores", element: <ListSuscriptores /> },
          { path: "campos", element: <ListCampos /> },
          { path: "formularios", element: <ListFormularios /> },

          { path: "segmentos", element: <ListSegmentos /> },
          { path: "ajustes", element: <ListAjustes /> },

          {
            path: "notificaciones",
            element: <ListNotificaciones />,
            children: [
              { index: true, element: <ListNotificacionesGeneral /> },
              { path: "confirm-email", element: <ListNotificacionesConfirmEmail /> },
              { path: "confirm-page", element: <ListNotificacionesConfirmPage /> },
              { path: "unsubscribe", element: <ListNotificacionesUnsubscribe /> },
            ],
          },

          { path: "audiencias", element: <ListAudiencias /> },
          { path: "herramientas", element: <ListHerramientas /> },
        ],
      },

      // TEMPLATES
      { path: "templates", element: <Templates /> },
      { path: "templates/create", element: <CreateTemplate /> },
      { path: "templates/edit/:id", element: <TemplateEditor /> },
      { path: "templates/tags", element: <TemplateTagsPage /> },

      // SUBSCRIBERS
      { path: "subscribers/add", element: <AddSubscriber /> },

      // FORMULARIOS: el mismo módulo que CRM › Formularios (constructor unificado)
      { path: "forms", element: <CrmForms /> },
      { path: "forms/new", element: <CrmFormBuilder /> },
      { path: "forms/edit/:id", element: <CrmFormBuilder /> },
    ],
  },
]);

export default router;
