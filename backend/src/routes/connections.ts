import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import * as truelayer from "../services/truelayer.js";

const router = Router();

// GET /api/connections — list all connections
router.get("/", async (_req, res) => {
  const connections = await prisma.bankConnection.findMany({
    include: { accounts: true },
    orderBy: { createdAt: "desc" },
  });

  // Strip tokens from response
  const safe = connections.map(({ accessToken, refreshToken, ...rest }) => rest);
  res.json(safe);
});

// GET /api/connections/auth-url — get TrueLayer auth URL
router.get("/auth-url", (_req, res) => {
  const url = truelayer.getAuthUrl();
  res.json({ url });
});

// GET /api/connections/callback — TrueLayer OAuth callback
router.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;

  if (!code) {
    res.redirect(`${env.FRONTEND_URL}/connections?error=no_code`);
    return;
  }

  try {
    const tokens = await truelayer.exchangeCode(code);
    const meta = await truelayer.getConnectionMetadata(tokens.access_token);

    const connection = await prisma.bankConnection.create({
      data: {
        provider: "truelayer",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        institutionName: meta.provider || "Unknown Bank",
        status: "active",
        consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // ~90 days
      },
    });

    // Fetch and create accounts immediately
    try {
      const accounts = await truelayer.fetchAccounts(tokens.access_token);
      for (const acc of accounts) {
        await prisma.account.upsert({
          where: {
            connectionId_providerAccountId: {
              connectionId: connection.id,
              providerAccountId: acc.account_id,
            },
          },
          create: {
            connectionId: connection.id,
            providerAccountId: acc.account_id,
            accountName: acc.display_name,
            accountType: acc.account_type,
            currency: acc.currency,
          },
          update: {
            accountName: acc.display_name,
            accountType: acc.account_type,
            currency: acc.currency,
          },
        });
      }
    } catch {
      // Non-fatal: accounts will be fetched on first sync
    }

    res.redirect(`${env.FRONTEND_URL}/connections?success=true`);
  } catch {
    res.redirect(`${env.FRONTEND_URL}/connections?error=auth_failed`);
  }
});

// DELETE /api/connections/:id
router.delete("/:id", async (req, res) => {
  await prisma.bankConnection.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
