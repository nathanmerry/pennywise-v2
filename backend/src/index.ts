import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";

import connectionRoutes from "./routes/connections.js";
import accountRoutes from "./routes/accounts.js";
import transactionRoutes from "./routes/transactions.js";
import categoryRoutes from "./routes/categories.js";
import ruleRoutes from "./routes/rules.js";
import syncRoutes from "./routes/sync.js";

const app = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));

app.use("/api/connections", connectionRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/rules", ruleRoutes);
app.use("/api/sync", syncRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

const port = parseInt(env.PORT, 10);

app.listen(port, () => {
  logger.info({ port }, "Server started");
});
