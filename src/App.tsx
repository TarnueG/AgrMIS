import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Customers from "./pages/Customers";
import Orders from "./pages/Orders";
import Production from "./pages/Production";
import Finance from "./pages/Finance";
import Reports from "./pages/Reports";
import Procurement from "./pages/Procurement";
import Employees from "./pages/Employees";
import LandParcels from "./pages/LandParcels";
import Machinery from "./pages/Machinery";
import Livestock from "./pages/Livestock";
import Marketing from "./pages/Marketing";
import SalesOrderPoints from "./pages/SalesOrderPoints";
import { Settings, AccessControl } from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />

            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute subsystem="inventory"><Inventory /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute subsystem="crm"><Customers /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute subsystem="sales_order_points"><Orders /></ProtectedRoute>} />
            <Route path="/production" element={<ProtectedRoute subsystem="production"><Production /></ProtectedRoute>} />
            <Route path="/finance" element={<ProtectedRoute subsystem="finance"><Finance /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute subsystem="reports"><Reports /></ProtectedRoute>} />
            <Route path="/procurement" element={<ProtectedRoute subsystem="procurement"><Procurement /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute subsystem="human_capital"><Employees /></ProtectedRoute>} />
            <Route path="/assets/land" element={<ProtectedRoute subsystem="land_parcels"><LandParcels /></ProtectedRoute>} />
            <Route path="/assets/machinery" element={<ProtectedRoute subsystem="machinery"><Machinery /></ProtectedRoute>} />
            <Route path="/assets/livestock" element={<ProtectedRoute subsystem="livestock"><Livestock /></ProtectedRoute>} />
            <Route path="/marketing" element={<ProtectedRoute subsystem="marketing"><Marketing /></ProtectedRoute>} />
            <Route path="/sales-order-points" element={<ProtectedRoute subsystem="sales_order_points"><SalesOrderPoints /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute subsystem="settings"><Settings /></ProtectedRoute>} />
            <Route path="/access-control" element={<ProtectedRoute subsystem="settings"><AccessControl /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
