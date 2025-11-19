import { Router } from "express";
import { authenticate } from "../middleware/auth";
import Settings from "../models/settings"; // The updated model is imported here
import { AppError } from "../utils/error";
import { logger } from "../utils/logger";

const router = Router();

router.get("/", authenticate, async (req, res, next) => {
  try {
    // Fetch the single settings document
    const settings = await Settings.findOne();
    if (!settings) {
      logger.warn("Settings not found, returning default");
      // If no settings document exists, create and return a default one
      const defaultSettings = await Settings.create({
        businessName: "MedCare Pharmacy",
        address: "123 Pharmacy Lane, City",
        contact: "9876543210",
        email: "contact@medcare.com",
        taxRate: 10,
        currency: "₹",
        theme: "light",
        language: "en",
      });
      return res.json(defaultSettings);
    }
    res.json(settings);
  } catch (error: any) {
    logger.error(`Failed to fetch settings: ${error.message}`);
    next(new AppError("Failed to fetch settings", 500));
  }
});

router.put("/", authenticate, async (req, res, next) => {
  try {
    // Use findOneAndUpdate with upsert: true to ensure the singleton document exists/is updated
    // req.body now uses 'contact' and 'currency' (fixed in frontend/model)
    const settings = await Settings.findOneAndUpdate({}, req.body, {
      new: true,
      upsert: true,
      runValidators: true,
    });
    logger.info("Settings updated successfully");
    res.json(settings);
  } catch (error: any) {
    logger.error(`Failed to update settings: ${error.message}`);
    next(new AppError("Failed to update settings", 500));
  }
});

export default router;