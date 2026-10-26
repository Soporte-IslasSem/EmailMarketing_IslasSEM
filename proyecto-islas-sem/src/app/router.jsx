import { createBrowserRouter, Navigate } from "react-router-dom";

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
import TalentoDigital from "../modules/talentoDigital/TalentoDigital.jsx";
import WhatsApp from "../modules/whatsapp/pages/WhatsApp.jsx";
import WhatsAppSettings from "../modules/whatsapp/pages/WhatsAppSettings.jsx";
import WhatsAppFunnels from "../modules/whatsapp/pages/Funnels.jsx";
import WhatsAppTemplates from "../modules/whatsapp/pages/Templates.jsx";
import WhatsAppBroadcasts from "../modules/whatsapp/pages/Broadcasts.jsx";
import CrmForms from "../modules/crm/pages/CrmForms.jsx";
import CrmFormBuilder from "../modules/crm/pages/CrmFormBuilder.jsx";
import CrmSettings from "../modules/crm/pages/CrmSettings.jsx";
import AccessGate from "../shared/access/AccessGate.jsx";
import Access from "../modules/crm/pages/Access.jsx";
import MyCompany, { Subscription } from "../modules/crm/pages/MyCompany.jsx";
import Onboarding from "../modules/auth/pages/Onboarding/Onboarding.jsx";
import PlatformAdmin from "../modules/platform/PlatformAdmin.jsx";
import RestaurantsLayout, { LegacyRestaurants } from "../modules/restaurants/layout/RestaurantsLayout.jsx";
import RestaurantClients from "../modules/restaurants/pages/Clients.jsx";
import RestaurantDetail from "../modules/restaurants/pages/RestaurantDetail.jsx";
import RestaurantCampaigns from "../modules/restaurants/pages/CampaignsPage.jsx";
import RestaurantCampaignWizard from "../modules/restaurants/pages/CampaignWizard.jsx";
import { Panel as RestaurantPanel, Reservations as RestaurantReservations, Reviews as RestaurantReviews, Team as RestaurantTeam, Settings as RestaurantSettings } from "../modules/restaurants/pages/SectionPages.jsx";
import RecycleBin from "../modules/crm/pages/RecycleBin.jsx";
import History from "../modules/crm/pages/History.jsx";

// RECURSOS (público)
import Blog from "../pages/Blog.jsx";
import Glosario from "../pages/Glosario.jsx";
import OtrosRecursos from "../pages/OtrosRecursos.jsx";
import HerramientasGratuitas from "../pages/HerramientasGratuitas.jsx";

// FORMULARIOS PÚBLICOS (SEPA / Datos Jurídicos)
import PublicForm from "../modules/forms/public/PublicForm.jsx";
import Contracts from "../modules/contracts/pages/Contracts.jsx";
import SignContract from "../modules/contracts/pages/SignContract.jsx";
import VerifyContract from "../modules/contracts/pages/VerifyContract.jsx";
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
  // CONTRATOS (sin login): enlace personal de firma y verificación por código.
  { path: "/firmar/:token", element: <SignContract /> },
  { path: "/verificar", element: <VerifyContract /> },
  { path: "/verificar/:code", element: <VerifyContract /> },
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

  // Enlaces antiguos de Restaurantes (era una pantalla aparte): llevan a la misma página dentro del panel
  { path: "/restaurantes/*", element: <LegacyRestaurants /> },

  // Alta de empresa (tras registrarse para crear una) y pago de una cuenta suspendida
  { path: "/alta-empresa", element: <AccessGate><Onboarding /></AccessGate> },
  { path: "/suscripcion", element: <AccessGate><Subscription /></AccessGate> },

  // DASHBOARD
  {
    path: "/dashboard",
    element: <AccessGate><DashboardLayout /></AccessGate>,
    children: [
      { index: true, element: <DashboardHome /> },

      // RESTAURANTES (submenú en el lateral)
      {
        path: "restaurantes",
        element: <RestaurantsLayout />,
        children: [
        { index: true, element: <RestaurantPanel /> },
        { path: "clientes", element: <RestaurantClients /> },
        { path: "clientes/:id", element: <RestaurantDetail /> },
        { path: "reservas", element: <RestaurantReservations /> },
        { path: "resenas", element: <RestaurantReviews /> },
        { path: "campanas", element: <RestaurantCampaigns /> },
        { path: "campanas/:id", element: <RestaurantCampaignWizard /> },
        { path: "equipo", element: <RestaurantTeam /> },
        { path: "ajustes", element: <RestaurantSettings /> },
        { path: "*", element: <Navigate to="/dashboard/restaurantes" replace /> },
        ],
      },

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
      { path: "talento-digital", element: <TalentoDigital /> },
      { path: "whatsapp", element: <WhatsApp /> },
      { path: "whatsapp/ajustes", element: <WhatsAppSettings /> },
      { path: "whatsapp/embudos", element: <WhatsAppFunnels /> },
      { path: "whatsapp/plantillas", element: <WhatsAppTemplates /> },
      { path: "whatsapp/difusiones", element: <WhatsAppBroadcasts /> },
      { path: "crm/forms", element: <CrmForms /> },
      { path: "crm/forms/new", element: <CrmFormBuilder /> },
      { path: "crm/forms/edit/:id", element: <CrmFormBuilder /> },
      { path: "crm/quotes", element: <SalesDocs type="quotes" /> },
      { path: "crm/invoices", element: <SalesDocs type="invoices" /> },
      { path: "crm/contracts", element: <Contracts /> },
      { path: "crm/products", element: <Products /> },
      { path: "crm/history", element: <History /> },
      { path: "crm/recyclebin", element: <RecycleBin /> },
      { path: "crm/settings", element: <CrmSettings /> },

      // enlaces antiguos
      { path: "restaurants/*", element: <Navigate to="/dashboard/restaurantes/clientes" replace /> },

      // Tareas
      { path: "tasks", element: <Activities /> },
      { path: "tasks/calendar", element: <Calendar /> },

      // Administración
      { path: "admin/team", element: <Employees /> },
      { path: "admin/departments", element: <Departments /> },
      { path: "admin/salesteams", element: <SalesTeams /> },
      { path: "admin/roles", element: <Roles /> },
      { path: "admin/accesos", element: <Access /> },
      { path: "admin/empresa", element: <MyCompany /> },
      { path: "plataforma", element: <PlatformAdmin /> },
      { path: "admin/integraciones", element: <Integrations /> },
      { path: "admin/audit", element: <Audit /> },

      // AUTOMATIZACIONES
      { path: "automations", element: <Automations /> },

      // LISTS
      { path: "lists", element: <Lists /> },
      { path: "lists/create", element: <Navigate to="/dashboard/lists" replace /> }, // se crean desde Listas (cada lista es un tipo de cliente)

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
      { path: "subscribers/add", element: <Navigate to="/dashboard/lists" replace /> }, // se añaden desde cada lista (así entran también en el CRM)

      // FORMULARIOS: el mismo módulo que CRM › Formularios (constructor unificado)
      { path: "forms", element: <CrmForms /> },
      { path: "forms/new", element: <CrmFormBuilder /> },
      { path: "forms/edit/:id", element: <CrmFormBuilder /> },
    ],
  },
]);

export default router;
