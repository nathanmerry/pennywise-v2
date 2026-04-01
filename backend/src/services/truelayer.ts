import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface TrueLayerAccount {
  account_id: string;
  account_type: string;
  display_name: string;
  currency: string;
  account_number?: { number?: string; sort_code?: string };
  provider?: { display_name?: string };
  update_timestamp?: string;
}

interface TrueLayerTransaction {
  transaction_id: string;
  timestamp: string;
  description: string;
  amount: number;
  currency: string;
  transaction_type: string;
  transaction_category: string;
  transaction_classification: string[];
  merchant_name?: string;
  running_balance?: { amount: number; currency: string };
  meta?: Record<string, unknown>;
  status?: string;
}

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.TRUELAYER_CLIENT_ID,
    scope: "info accounts balance cards transactions direct_debits standing_orders offline_access",
    redirect_uri: env.TRUELAYER_REDIRECT_URI,
    providers: "uk-ob-all uk-oauth-all",
  });

  return `${env.TRUELAYER_AUTH_URL}/?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(`${env.TRUELAYER_AUTH_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.TRUELAYER_CLIENT_ID,
      client_secret: env.TRUELAYER_CLIENT_SECRET,
      redirect_uri: env.TRUELAYER_REDIRECT_URI,
      code,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "TrueLayer token exchange failed");
    throw new Error(`Token exchange failed: ${res.status}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${env.TRUELAYER_AUTH_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.TRUELAYER_CLIENT_ID,
      client_secret: env.TRUELAYER_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "TrueLayer token refresh failed");
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  return res.json() as Promise<TokenResponse>;
}

async function apiGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${env.TRUELAYER_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body, path }, "TrueLayer API call failed");
    throw new Error(`TrueLayer API error: ${res.status} on ${path}`);
  }

  const json = await res.json() as { results: T };
  return json.results;
}

export async function fetchAccounts(accessToken: string): Promise<TrueLayerAccount[]> {
  return apiGet<TrueLayerAccount[]>(accessToken, "/data/v1/accounts");
}

export async function fetchTransactions(
  accessToken: string,
  accountId: string,
  from: string,
  to: string
): Promise<TrueLayerTransaction[]> {
  return apiGet<TrueLayerTransaction[]>(
    accessToken,
    `/data/v1/accounts/${accountId}/transactions?from=${from}&to=${to}`
  );
}

export async function fetchPendingTransactions(
  accessToken: string,
  accountId: string
): Promise<TrueLayerTransaction[]> {
  try {
    return await apiGet<TrueLayerTransaction[]>(
      accessToken,
      `/data/v1/accounts/${accountId}/transactions/pending`
    );
  } catch {
    // Not all providers support pending transactions
    return [];
  }
}

export async function getConnectionMetadata(accessToken: string): Promise<{ provider?: string }> {
  try {
    const info = await apiGet<Array<{ provider?: { display_name?: string } }>>(
      accessToken,
      "/data/v1/info"
    );
    return { provider: info?.[0]?.provider?.display_name };
  } catch {
    return {};
  }
}
