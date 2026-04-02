import { Router } from "express";
import { syncAllConnections, syncConnection } from "../services/sync.js";

const router = Router();

// POST /api/sync — sync all active connections
router.post("/", async (_req, res) => {
  const results = await syncAllConnections();
  res.json({ results });
});

// POST /api/sync/:connectionId — sync a specific connection
router.post("/:connectionId", async (req, res) => {
  const result = await syncConnection(req.params.connectionId);
  res.json(result);
});

export default router;
