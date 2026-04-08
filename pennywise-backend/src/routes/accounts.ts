import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

// GET /api/accounts — list all accounts
router.get("/", async (_req, res) => {
  const accounts = await prisma.account.findMany({
    include: {
      connection: {
        select: { id: true, institutionName: true, status: true },
      },
    },
    orderBy: { accountName: "asc" },
  });
  res.json(accounts);
});

export default router;
