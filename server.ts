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

// ✅ CORS
app.use(cors({ origin: ENV.CORS_ORIGIN }));

// ✅ Helmet (Different for DEV vs PROD)
if (ENV.NODE_ENV === "development") {
  console.log("✅ Running in DEVELOPMENT mode — CSP Disabled for easier debugging");

  app.use(
    helmet({
      contentSecurityPolicy: false, // ✅ Disable CSP in dev
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
          frameSrc: ["'self'", "https:"], // ✅ Required for Razorpay iframe
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );
}

// ✅ Body parser
app.use(express.json());

// ✅ Logger
app.use(
  morgan("combined", {
    stream: { write: (msg: string) => logger.info(msg.trim()) },
  })
);

// ✅ Rate limiting
app.use(rateLimiter);

// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/razorpay", razorpayRoutes);

// ✅ Global Error Handler
app.use(errorHandler);

// ✅ Start Server
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

startServer();
