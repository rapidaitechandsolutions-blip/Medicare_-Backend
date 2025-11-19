import { Router, Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, IUser } from "../models/user"; // Assuming IUser is exported from your model
import { ENV } from "../config/env";
import { logger } from "../utils/logger";
import { AppError } from "../utils/error";
import {
  authenticate,
  AuthenticatedRequest,
} from "../middleware/auth"; // Fixed: Import middleware and custom request type

const router = Router();

// A helper function to safely cast the user document
const toUserResponse = (user: IUser) => ({
  id: user._id.toString(),
  username: user.username,
  name: user.name,
  role: user.role,
  email: user.email,
  mobile: user.mobile,
});

router.post(
  "/login",
  [
    body("username")
      .notEmpty()
      .withMessage("Username is required")
      .trim()
      .escape(),
    body("password").notEmpty().withMessage("Password is required"),
    body("role")
      .optional()
      .isIn(["admin", "cashier"])
      .withMessage("Invalid role"),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        `Validation errors in POST /api/auth/login: ${JSON.stringify(
          errors.array()
        )}`
      );
      return next(new AppError("Validation errors", 400, errors.array()));
    }

    const { username, password, role } = req.body;

    logger.info(
      `Login attempt: username=${username}, role=${role || "not provided"}`
    );

    try {
      const query: any = { username };
      if (role) query.role = role;

      const user = await User.findOne(query).exec();
      if (!user) {
        logger.warn(
          `User not found: username=${username}, role=${role || "not provided"}`
        );
        return next(new AppError("Invalid credentials", 401));
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        logger.warn(`Invalid password for username=${username}`);
        return next(new AppError("Invalid credentials", 401));
      }

      const token = jwt.sign(
        { id: user._id.toString(), username: user.username, role: user.role },
        ENV.JWT_SECRET,
        {
          expiresIn: "1h",
        }
      );

      logger.info(`Login successful: username=${username}, role=${user.role}`);
      res.json({
        token,
        user: toUserResponse(user), // Fixed: Use helper to create response
      });
    } catch (error: any) {
      logger.error(`Login error: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

router.get(
  "/me",
  authenticate, // This will now be found
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { // Fixed: Use AuthenticatedRequest
    try {
      // Fixed: Access user id via req.user.id
      const user = await User.findById(req.user?.id).select("-password");
      if (!user) {
        logger.warn(`User not found: id=${req.user?.id}`);
        return next(new AppError("User not found", 404));
      }
  res.json({ user: toUserResponse(user) });
    } catch (error: any) {
      logger.error(`Failed to fetch user: ${error.message}`);
      next(new AppError("Failed to fetch user", 500));
    }
  }
);

router.patch(
  "/profile",
  authenticate, // This will now be found
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { // Fixed: Use AuthenticatedRequest
    try {
      const { name, email, mobile } = req.body;
      const user = await User.findByIdAndUpdate(
        req.user?.id, // Fixed: Access user id via req.user.id
        { name, email, mobile },
        { new: true, runValidators: true }
      ).select("-password");

      if (!user) {
        logger.warn(`User not found for profile update: id=${req.user?.id}`);
        return next(new AppError("User not found", 404));
      }
      logger.info(`Profile updated for user: id=${req.user?.id}`);
      res.json(toUserResponse(user)); // Fixed: Use helper
    } catch (error: any) {
      logger.error(`Failed to update profile: ${error.message}`);
      next(new AppError("Failed to update profile", 500));
    }
  }
);

export default router;
