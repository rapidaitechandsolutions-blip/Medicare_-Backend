import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { AppError } from "../utils/error";
import { ENV } from "../config/env";

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.error(`AppError: ${err.message} - Status: ${err.statusCode}`, {
      details: err.details,
    });
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  logger.error(`Unexpected error: ${err.message}`, {
    stack: err.stack || "No stack trace available",
  });
  res.status(500).json({
    error: "Server error",
    details: ENV.NODE_ENV === "development" ? err.message : undefined,
  });
};
