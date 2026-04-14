import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const rawConnectionString = process.env.DATABASE_URL!;
const needsSsl = /sslmode=(require|verify-ca|verify-full)/.test(rawConnectionString);
const connectionString = needsSsl
  ? rawConnectionString.replace(/([?&])sslmode=[^&]*(&|$)/, (_, pre, post) => (post === "&" ? pre : ""))
  : rawConnectionString;

const adapter = new PrismaPg({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

export const prisma = new PrismaClient({ adapter });
