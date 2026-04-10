import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Layout } from "./components/layout";
import { OverviewPage } from "./pages/overview-page";
import { SpendingPage } from "./pages/spending-page";
import { BudgetPage } from "./pages/budget-page";
import { TransactionsPage } from "./pages/transactions-page";
import { ConnectionsPage } from "./pages/connections-page";
import { CategoriesPage } from "./pages/categories-page";
import { RulesPage } from "./pages/rules-page";
import { useSyncAll } from "./hooks/use-connections";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function AppContent() {
  const syncAll = useSyncAll();

  return (
    <BrowserRouter>
      <Layout onSync={() => syncAll.mutate()} isSyncing={syncAll.isPending}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/spending" element={<SpendingPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}

export default App;
