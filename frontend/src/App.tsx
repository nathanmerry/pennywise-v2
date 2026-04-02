import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Layout } from "./components/layout";
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

type Page = "transactions" | "connections" | "categories" | "rules";

function AppContent() {
  const [page, setPage] = useState<Page>("transactions");
  const syncAll = useSyncAll();

  return (
    <Layout
      activePage={page}
      onNavigate={setPage}
      onSync={() => syncAll.mutate()}
      isSyncing={syncAll.isPending}
    >
      {page === "transactions" && <TransactionsPage />}
      {page === "connections" && <ConnectionsPage />}
      {page === "categories" && <CategoriesPage />}
      {page === "rules" && <RulesPage />}
    </Layout>
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
