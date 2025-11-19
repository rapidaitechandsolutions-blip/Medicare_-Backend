// src/config/env.ts
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Coerce PORT to a number safely
  PORT: z
    .preprocess((val) => {
      if (typeof val === "string" && val.trim().length) return Number(val);
      if (typeof val === "number") return val;
      return 5000;
    }, z.number().int().positive())
    .default(5000),

  /**
   * CORS_ORIGIN:
   * Accepts:
   * - a single URL string ("http://localhost:3000")
   * - or a comma-separated list ("http://a.com,http://b.com")
   * Normalizes to string[] of valid URLs
   */
  CORS_ORIGIN: z
    .preprocess((val) => {
      // If undefined/null -> default handled later
      if (!val) return ["http://localhost:5173"];
      if (typeof val === "string") {
        return val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (Array.isArray(val)) return val;
      return ["http://localhost:5173"];
    }, z.array(z.string().url()))
    .default(["http://localhost:5173"]),

  // Optional base paths used for mounting routes — keep as strings (we sanitize later)
  API_BASE: z.string().optional().default(""),
  BASE_PATH: z.string().optional().default(""),

  JWT_SECRET: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
});

export const ENV = envSchema.parse(process.env);

// optional: export type for convenience elsewhere
export type Env = typeof ENV;
