import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const needsSsl = /sslmode=(require|verify-ca|verify-full)/.test(connectionString);

const adapter = new PrismaPg({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

export const prisma = new PrismaClient({ adapter });
