import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  // Add this NODE_ENV property
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z
    .string()
    .default("5000")
    .transform((val: string) => parseInt(val, 10)),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
});

export const ENV = envSchema.parse(process.env);
