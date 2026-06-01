import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import InventoryAnalytics from "./pages/InventoryAnalytics";
import InventoryAnalyticsDrilldown from "./pages/InventoryAnalyticsDrilldown";
import Customers from "./pages/Customers";
import CRMAnalytics from "./pages/CRMAnalytics";
import CRMAnalyticsDrilldown from "./pages/CRMAnalyticsDrilldown";
import Orders from "./pages/Orders";
import Production from "./pages/Production";
import ProductionAnalytics from "./pages/ProductionAnalytics";
import ProductionAnalyticsDrilldown from "./pages/ProductionAnalyticsDrilldown";
import Finance from "./pages/Finance";
import Reports from "./pages/Reports";
import Procurement from "./pages/Procurement";
import ProcurementAnalytics from "./pages/ProcurementAnalytics";
import ProcurementAnalyticsDrilldown from "./pages/ProcurementAnalyticsDrilldown";
import Employees from "./pages/Employees";
import LandParcels from "./pages/LandParcels";
import Machinery from "./pages/Machinery";
import AssetAnalytics from "./pages/AssetAnalytics";
import AssetAnalyticsDrilldown from "./pages/AssetAnalyticsDrilldown";
import Livestock from "./pages/Livestock";
import Marketing from "./pages/Marketing";
import MarketingAnalytics from "./pages/MarketingAnalytics";
import MarketingAnalyticsDrilldown from "./pages/MarketingAnalyticsDrilldown";
import CheckoutPage from "./pages/CheckoutPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import SalesOrderPoints from "./pages/SalesOrderPoints";
import { Settings, AccessControl } from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <AuthProvider>
      <ConfirmProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />

            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute subsystem="inventory"><Inventory /></ProtectedRoute>} />
            <Route path="/inventory/analytics" element={<ProtectedRoute subsystem="inventory"><InventoryAnalytics /></ProtectedRoute>} />
            <Route path="/inventory/analytics/:metric" element={<ProtectedRoute subsystem="inventory"><InventoryAnalyticsDrilldown /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute subsystem="crm"><Customers /></ProtectedRoute>} />
            <Route path="/crm/analytics" element={<ProtectedRoute subsystem="crm"><CRMAnalytics /></ProtectedRoute>} />
            <Route path="/crm/analytics/customers" element={<ProtectedRoute subsystem="crm"><CRMAnalyticsDrilldown metric="customers" /></ProtectedRoute>} />
            <Route path="/crm/analytics/purchases" element={<ProtectedRoute subsystem="crm"><CRMAnalyticsDrilldown metric="purchases" /></ProtectedRoute>} />
            <Route path="/crm/analytics/carts" element={<ProtectedRoute subsystem="crm"><CRMAnalyticsDrilldown metric="carts" /></ProtectedRoute>} />
            <Route path="/crm/analytics/segments" element={<ProtectedRoute subsystem="crm"><CRMAnalyticsDrilldown metric="segments" /></ProtectedRoute>} />
            <Route path="/crm/analytics/customers/top" element={<ProtectedRoute subsystem="crm"><CRMAnalyticsDrilldown metric="top-customers" /></ProtectedRoute>} />
            <Route path="/crm/analytics/products/top" element={<ProtectedRoute subsystem="crm"><CRMAnalyticsDrilldown metric="top-products" /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute subsystem="sales_order_points"><Orders /></ProtectedRoute>} />
            <Route path="/production" element={<ProtectedRoute subsystem="production"><Production /></ProtectedRoute>} />
            <Route path="/production/analytics" element={<ProtectedRoute subsystem="production"><ProductionAnalytics /></ProtectedRoute>} />
            <Route path="/production/analytics/:metric" element={<ProtectedRoute subsystem="production"><ProductionAnalyticsDrilldown /></ProtectedRoute>} />
            <Route path="/finance" element={<ProtectedRoute subsystem="finance"><Finance /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute subsystem="reports"><Reports /></ProtectedRoute>} />
            <Route path="/procurement" element={<ProtectedRoute subsystem="procurement"><Procurement /></ProtectedRoute>} />
            <Route path="/procurement/analytics" element={<ProtectedRoute subsystem="procurement"><ProcurementAnalytics /></ProtectedRoute>} />
            <Route path="/procurement/analytics/:metric" element={<ProtectedRoute subsystem="procurement"><ProcurementAnalyticsDrilldown /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute subsystem="human_capital"><Employees /></ProtectedRoute>} />
            <Route path="/assets/land" element={<ProtectedRoute subsystem="land_parcels"><LandParcels /></ProtectedRoute>} />
            <Route path="/assets/machinery" element={<ProtectedRoute subsystem="machinery"><Machinery /></ProtectedRoute>} />
            <Route path="/assets/analytics" element={<ProtectedRoute subsystem="machinery"><AssetAnalytics /></ProtectedRoute>} />
            <Route path="/assets/analytics/:metric" element={<ProtectedRoute subsystem="machinery"><AssetAnalyticsDrilldown /></ProtectedRoute>} />
            <Route path="/assets/livestock" element={<ProtectedRoute subsystem="livestock"><Livestock /></ProtectedRoute>} />
            <Route path="/marketing" element={<ProtectedRoute subsystem="marketing"><Marketing /></ProtectedRoute>} />
            <Route path="/marketing/analytics" element={<ProtectedRoute subsystem="marketing"><MarketingAnalytics /></ProtectedRoute>} />
            <Route path="/marketing/analytics/orders/:metric" element={<ProtectedRoute subsystem="marketing"><MarketingAnalyticsDrilldown /></ProtectedRoute>} />
            <Route path="/checkout" element={<ProtectedRoute subsystem="sales_order_points"><CheckoutPage /></ProtectedRoute>} />
            <Route path="/payment-success" element={<ProtectedRoute subsystem="sales_order_points"><PaymentSuccessPage /></ProtectedRoute>} />
            <Route path="/sales-order-points" element={<ProtectedRoute subsystem="sales_order_points"><SalesOrderPoints /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute subsystem="settings"><Settings /></ProtectedRoute>} />
            <Route path="/access-control" element={<ProtectedRoute subsystem="settings"><AccessControl /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </ConfirmProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
