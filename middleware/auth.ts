import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { logger } from "../utils/logger";
import { AppError } from "../utils/error";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string; role: string };
  // ADD: Define the optional 'file' property added by multer
  file?: Express.Multer.File;
}

// FIX: Renamed 'verifyToken' to 'authenticate' to match the import
export const authenticate: RequestHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    logger.warn(`No token provided in request to ${req.originalUrl}`);
    return next(new AppError("No token provided", 401));
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as {
      id: string;
      username: string;
      role: string;
    };
    req.user = decoded;
    logger.info(`Token verified for user: ${decoded.username}`);
    next();
  } catch (error: any) {
    logger.warn(
      `Invalid token in request to ${req.originalUrl}: ${
        error.message || error
      }`
    );
    next(new AppError("Invalid token", 401));
  }
};

export const restrictToAdmin: RequestHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== "admin") {
    logger.warn(
      `Unauthorized access attempt by user: ${
        req.user?.username || "unknown"
      } to ${req.originalUrl}`
    );
    return next(new AppError("Access denied. Admin role required.", 403));
  }
  next();
};
