import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Layout } from "./shared/components/layout";
import { OverviewPage } from "./features/overview/overview-page";
import { SpendingPage } from "./features/spending-analysis/spending-page";
import { BudgetPage } from "./features/budget/budget-page";
import { TransactionsPage } from "./features/transactions/transactions-page";
import { ConnectionsPage } from "./features/connections/connections-page";
import { CategoriesPage } from "./features/categories/categories-page";
import { RulesPage } from "./features/rules/rules-page";
import { useSyncAll } from "./shared/hooks/use-connections";

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
