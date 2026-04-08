import "dotenv/config";
import { z } from "zod/v4";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  TRUELAYER_CLIENT_ID: z.string(),
  TRUELAYER_CLIENT_SECRET: z.string(),
  TRUELAYER_REDIRECT_URI: z.string().default("http://localhost:3382/api/connections/callback"),
  TRUELAYER_AUTH_URL: z.string().default("https://auth.truelayer-sandbox.com"),
  TRUELAYER_API_URL: z.string().default("https://api.truelayer-sandbox.com"),
  PORT: z.string().default("3382"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  OPENAI_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
