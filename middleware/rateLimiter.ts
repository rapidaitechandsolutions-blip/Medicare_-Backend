import rateLimit from "express-rate-limit";
import { logger } from "../utils/logger";

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res
      .status(429)
      .json({ error: "Too many requests, please try again later." });
  },
});
