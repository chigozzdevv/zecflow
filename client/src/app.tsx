import { LandingPage } from "@/pages/landing-page";
import { AuthPage } from "@/pages/auth-page";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { DashboardOverviewPage } from "@/pages/dashboard/overview";
import { DashboardWorkflowsPage } from "@/pages/dashboard/workflows";
import { DashboardRunsPage } from "@/pages/dashboard/runs";
import { DashboardTriggersPage } from "@/pages/dashboard/triggers";
import { DashboardConnectorsPage } from "@/pages/dashboard/connectors";
import { DashboardCreditsPage } from "@/pages/dashboard/credits";
import { DashboardWorkflowPage } from "@/pages/dashboard/workflow";
import { DashboardBlocksLibraryPage } from "@/pages/dashboard/blocks-library";
import { BrowserRouter, Route, Routes } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardOverviewPage />} />
          <Route path="workflows" element={<DashboardWorkflowsPage />} />
          <Route path="workflow" element={<DashboardWorkflowPage />} />
          <Route path="runs" element={<DashboardRunsPage />} />
          <Route path="triggers" element={<DashboardTriggersPage />} />
          <Route path="connectors" element={<DashboardConnectorsPage />} />
          <Route path="blocks" element={<DashboardBlocksLibraryPage />} />
          <Route path="credits" element={<DashboardCreditsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
