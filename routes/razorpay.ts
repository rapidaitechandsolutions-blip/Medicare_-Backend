import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto"; // Import crypto at the top level
import { ENV } from "../config/env";
import { authenticate } from "../middleware/auth";
import { logger } from "../utils/logger";
import { AppError } from "../utils/error";

const router = Router();

const razorpayInstance = new Razorpay({
  key_id: ENV.RAZORPAY_KEY_ID,
  key_secret: ENV.RAZORPAY_KEY_SECRET,
});

router.post("/create-order", authenticate, async (req, res, next) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;

    if (!amount || !receipt) {
      logger.warn("Missing required fields for Razorpay order creation");
      return next(new AppError("Amount and receipt are required", 400));
    }

    const options = {
      amount: Math.round(amount * 100), // Convert to smallest currency unit (paise)
      currency,
      receipt,
      payment_capture: 1, // Auto-capture payment
    };

    const order = await razorpayInstance.orders.create(options);
    logger.info(`Razorpay order created: ${order.id}`);
    res.json(order);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to create Razorpay order: ${errorMessage}`);
    next(new AppError("Failed to create order", 500, errorMessage));
  }
});

router.post("/verify-payment", authenticate, async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      logger.warn("Missing required fields for Razorpay payment verification");
      return next(new AppError("Missing required fields", 400));
    }

    const generated_signature = crypto
      .createHmac("sha256", ENV.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature === razorpay_signature) {
      logger.info(`Payment verified successfully: ${razorpay_payment_id}`);
      res.json({ status: "success" });
    } else {
      logger.warn(`Payment verification failed: ${razorpay_payment_id}`);
      return next(new AppError("Invalid payment signature", 400));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to verify payment: ${errorMessage}`);
    next(new AppError("Failed to verify payment", 500, errorMessage));
  }
});

export default router;
