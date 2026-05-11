import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
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
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/production" element={<Production />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/assets/land" element={<LandParcels />} />
            <Route path="/assets/machinery" element={<Machinery />} />
            <Route path="/assets/livestock" element={<Livestock />} />
            <Route path="/marketing" element={<Marketing />} />
            <Route path="/sales-order-points" element={<SalesOrderPoints />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/access-control" element={<AccessControl />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
