// server.ts (or index.ts) — drop-in replacement
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { connectToDatabase } from "./config/db";
import { ENV } from "./config/env";
import { errorHandler } from "./middleware/ErrorHandler";
import { rateLimiter } from "./middleware/rateLimiter";

import authRoutes from "./routes/auth";
import customerRoutes from "./routes/customers";
import productRoutes from "./routes/products";
import saleRoutes from "./routes/sales";
import invoiceRoutes from "./routes/invoices";
import settingsRoutes from "./routes/settings";
import razorpayRoutes from "./routes/razorpay";

import { logger } from "./utils/logger";

const app = express();

/**
 * Helper: sanitize any env-provided base so we never pass a full URL into app.use()
 * - if value is a full URL -> extract pathname
 * - normalize to '' or a path that starts with '/' and no trailing slash
 */
function sanitizeBasePath(value?: string) {
  if (!value) return "";
  // If it's a full URL, extract the pathname
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      const p = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
      return p;
    } catch (err) {
      // fallthrough to normalization
    }
  }
  // ensure leading slash (or empty) and remove trailing slashes
  const padded = value ? (value.startsWith("/") ? value : `/${value}`) : "";
  return padded.replace(/\/+$/, "");
}

/**
 * Setup CORS safely:
 * - Use a whitelist array
 * - Use a callback origin function that only returns true/false
 * - This avoids accidentally passing a URL into express route parser
 */
const allowedOrigins = [
  "https://medicare-frontend-705n.onrender.com",
  "http://localhost:3000",
];

// origin as a callback is safer when you want to log / accept tools (undefined origin)
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // origin === undefined for non-browser requests (curl, Postman, server-to-server)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error("CORS policy: Origin not allowed"), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
};

app.use(cors(corsOptions));
// handle preflight for all routes
app.options("*", cors(corsOptions));

// -----------------------------
// Helmet (Different for DEV vs PROD)
// -----------------------------
if (ENV.NODE_ENV === "development") {
  console.log("✅ Running in DEVELOPMENT mode — CSP Disabled for easier debugging");

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );
} else {
  console.log("✅ Running in PRODUCTION mode — Secure CSP Enabled");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https:", "blob:"],
          scriptSrcAttr: ["'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          styleSrc: ["'self'", "'unsafe-inline'", "https:"],
          connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"],
          frameSrc: ["'self'", "https:"], // Required for Razorpay iframe
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );
}

// -----------------------------
// Body parser (after security middleware)
// -----------------------------
app.use(express.json());

// -----------------------------
// Logger
// -----------------------------
app.use(
  morgan("combined", {
    stream: { write: (msg: string) => logger.info(msg.trim()) },
  })
);

// -----------------------------
// Rate limiting
// -----------------------------
app.use(rateLimiter);

// -----------------------------
// Resolve sanitized base path (guard against full URLs in ENV)
// -----------------------------
const SANITIZED_BASE = sanitizeBasePath(ENV.API_BASE ?? ENV.BASE_PATH);
if (ENV.API_BASE && SANITIZED_BASE === "") {
  // If API_BASE was a full URL with '/' path, sanitize returns ''. That's OK.
  logger.info("Resolved SANITIZED_BASE to empty (root).");
}
logger.info(`Mounting API routes at base: '${SANITIZED_BASE || "/"}'`);

// -----------------------------
// Routes (use sanitized base so we never pass a full URL into app.use)
// -----------------------------
app.use(`${SANITIZED_BASE}/auth`, authRoutes);
app.use(`${SANITIZED_BASE}/customers`, customerRoutes);
app.use(`${SANITIZED_BASE}/products`, productRoutes);
app.use(`${SANITIZED_BASE}/sales`, saleRoutes);
app.use(`${SANITIZED_BASE}/invoices`, invoiceRoutes);
app.use(`${SANITIZED_BASE}/settings`, settingsRoutes);
app.use(`${SANITIZED_BASE}/razorpay`, razorpayRoutes);

// -----------------------------
// Global Error Handler
// -----------------------------
app.use(errorHandler);

// -----------------------------
// Start Server
// -----------------------------
const startServer = async () => {
  try {
    await connectToDatabase();
    app.listen(ENV.PORT, () => {
      logger.info(`✅ Server running on http://localhost:${ENV.PORT}`);
      logger.info(`✅ Mode: ${ENV.NODE_ENV}`);
    });
  } catch (error) {
    logger.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Catch and log uncaught rejections/exception early to help debugging on startup
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});

startServer();
