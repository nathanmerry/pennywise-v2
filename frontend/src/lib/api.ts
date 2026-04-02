const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// Connections
export function fetchConnections() {
  return request<Connection[]>("/connections");
}

export function getAuthUrl() {
  return request<{ url: string }>("/connections/auth-url");
}

export function deleteConnection(id: string) {
  return request<{ ok: boolean }>(`/connections/${id}`, { method: "DELETE" });
}

// Accounts
export function fetchAccounts() {
  return request<Account[]>("/accounts");
}

// Transactions
export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  isIgnored?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function fetchTransactions(filters: TransactionFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val !== undefined && val !== "") params.set(key, String(val));
  });
  return request<PaginatedResponse<Transaction>>(`/transactions?${params}`);
}

export function updateTransaction(
  id: string,
  data: { note?: string | null; categoryId?: string | null; isIgnored?: boolean }
) {
  return request<Transaction>(`/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// Categories
export function fetchCategories() {
  return request<Category[]>("/categories");
}

export function createCategory(data: { name: string; color?: string | null }) {
  return request<Category>("/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCategory(id: string, data: { name?: string; color?: string | null }) {
  return request<Category>(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id: string) {
  return request<{ ok: boolean }>(`/categories/${id}`, { method: "DELETE" });
}

// Rules
export function fetchRules() {
  return request<RecurringRule[]>("/rules");
}

export function createRule(data: {
  matchType: "merchant" | "description";
  matchValue: string;
  categoryId?: string | null;
  setIgnored?: boolean | null;
  applyToExisting?: boolean;
}) {
  return request<{ rule: RecurringRule; applied: number }>("/rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateRule(
  id: string,
  data: Partial<{
    matchType: "merchant" | "description";
    matchValue: string;
    categoryId: string | null;
    setIgnored: boolean | null;
    active: boolean;
  }>
) {
  return request<RecurringRule>(`/rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteRule(id: string) {
  return request<{ ok: boolean }>(`/rules/${id}`, { method: "DELETE" });
}

export function applyRule(id: string) {
  return request<{ applied: number }>(`/rules/${id}/apply`, { method: "POST" });
}

// Sync
export function syncAll() {
  return request<{ results: SyncResult[] }>("/sync", { method: "POST" });
}

export function syncConnection(connectionId: string) {
  return request<SyncResult>(`/sync/${connectionId}`, { method: "POST" });
}

// Types
export interface Connection {
  id: string;
  provider: string;
  institutionName: string;
  status: string;
  consentExpiresAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  accounts: Account[];
}

export interface Account {
  id: string;
  providerAccountId: string;
  connectionId: string;
  accountName: string;
  accountType: string | null;
  accountSubType: string | null;
  currency: string;
  status: string;
  connection?: { id: string; institutionName: string; status: string };
}

export interface Transaction {
  id: string;
  source: string;
  sourceTransactionId: string;
  accountId: string;
  amount: string;
  currency: string;
  transactionDate: string;
  description: string;
  merchantName: string | null;
  pending: boolean;
  note: string | null;
  categoryId: string | null;
  categorySource: string | null;
  isIgnored: boolean;
  ignoreSource: string | null;
  createdAt: string;
  updatedAt: string;
  category: Category | null;
  account: Account & {
    connection: { institutionName: string };
  };
}

export interface Category {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  _count?: { transactions: number };
}

export interface RecurringRule {
  id: string;
  matchType: "merchant" | "description";
  matchValue: string;
  categoryId: string | null;
  setIgnored: boolean | null;
  active: boolean;
  createdAt: string;
  category: Category | null;
}

export interface SyncResult {
  synced: number;
  connectionId: string;
  status: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
