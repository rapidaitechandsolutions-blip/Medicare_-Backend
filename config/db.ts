import mongoose from "mongoose";
import { ENV } from "./env";
import { logger } from "../utils/logger";

export async function connectToDatabase() {
  try {
    await mongoose.connect(ENV.MONGODB_URI, {
      // These options are deprecated and can be removed in Mongoose 6+
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
    logger.info("Connected to MongoDB");
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}