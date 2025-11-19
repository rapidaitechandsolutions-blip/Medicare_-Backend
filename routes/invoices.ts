import { Router, Response, NextFunction } from "express";
import { body, validationResult, query } from "express-validator";
import { Sale } from "../models/sale";
import { Customer } from "../models/customer";
import { Product } from "../models/product";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { generateInvoiceId } from "../utils/invoice";
import { isValidISODate } from "../utils/validators";
import { logger } from "../utils/logger";
import { AppError } from "../utils/error";
import mongoose from "mongoose";
import { razorpay, verifyPaymentSignature } from "../utils/razorpay";
import { ENV } from "../config/env";
import { streamInvoicePdf } from "../utils/pdf"; // ✅ ADDED

const router = Router();

router.get(
  "/",
  authenticate,
  [
    query("startDate")
      .optional()
      .custom(isValidISODate)
      .withMessage("Invalid startDate format"),
    query("endDate")
      .optional()
      .custom(isValidISODate)
      .withMessage("Invalid endDate format"),
    query("customerId")
      .optional()
      .isMongoId()
      .withMessage("Invalid customer ID"),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        `Validation errors in GET /api/invoices: ${JSON.stringify(
          errors.array()
        )}`
      );
      return next(new AppError("Validation errors", 400, errors.array()));
    }

    const { startDate, endDate, customerId } = req.query;

    try {
      const query: any = {};

      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate as string).toISOString(),
          $lte: new Date(endDate as string).toISOString(),
        };
      }

      if (customerId) {
        if (!mongoose.Types.ObjectId.isValid(customerId as string)) {
          logger.warn(`Invalid customerId: ${customerId}`);
          return next(new AppError("Invalid customer ID", 400));
        }
        query.customerId = customerId;
      }

      const invoices = await Sale.find(query).lean().exec();
      logger.info(
        `Fetched ${invoices.length} invoices for user: ${req.user?.username}`
      );
      res.json(
        invoices.map((invoice) => ({
          id: invoice._id.toString(),
          invoiceId: invoice.invoiceId,
          customerId: invoice.customerId?.toString() || null,
          customerName: invoice.customerName,
          items: invoice.items,
          totalAmount: invoice.totalAmount,
          cashierId: invoice.cashierId.toString(),
          cashierName: invoice.cashierName,
          status: invoice.status,
          paymentStatus: invoice.paymentStatus,
          paymentMethod: invoice.paymentMethod, // ✅ ADDED in response
          createdAt: invoice.createdAt,
        }))
      );
    } catch (error: any) {
      logger.error(`Error fetching invoices: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

router.post(
  "/",
  authenticate,
  [
    body("customerId")
      .optional()
      .isMongoId()
      .withMessage("Invalid customer ID"),
    body("customerName")
      .optional()
      .isString()
      .withMessage("Customer name must be a string")
      .trim()
      .escape(),
    body("items")
      .isArray({ min: 1 })
      .withMessage("Items array must contain at least one item"),
    body("items.*.productId").notEmpty().withMessage("Product ID is required"),
    body("items.*.name")
      .notEmpty()
      .withMessage("Product name is required")
      .trim()
      .escape(),
    body("items.*.quantity")
      .isInt({ min: 1 })
      .withMessage("Quantity must be a positive integer"),
    body("items.*.price")
      .isFloat({ min: 0 })
      .withMessage("Price must be a non-negative number"),
    body("items.*.total")
      .isFloat({ min: 0 })
      .withMessage("Total must be a non-negative number"),
    body("totalAmount")
      .isFloat({ min: 0 })
      .withMessage("Total amount must be a non-negative number"),
    // ✅ ADDED: validate optional paymentMethod
    body("paymentMethod")
      .optional()
      .isIn(["cash", "upi"])
      .withMessage("paymentMethod must be 'cash' or 'upi'"),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        `Validation errors in POST /api/invoices: ${JSON.stringify(
          errors.array()
        )}`
      );
      return next(new AppError("Validation errors", 400, errors.array()));
    }

    const { customerId, customerName, items, totalAmount, paymentMethod } = req.body;
    const user = req.user!;

    logger.info(
      `Creating invoice: customerId=${
        customerId || "none"
      }, totalAmount=${totalAmount}, paymentMethod=${paymentMethod || "upi"} by user: ${user.username}`
    );

    try {
      if (customerId) {
        const customer = await Customer.findById(customerId).lean().exec();
        if (!customer) {
          logger.warn(`Customer not found: id=${customerId}`);
          return next(new AppError("Customer not found", 404));
        }
      }

      // stock checks and decrement
      for (const item of items) {
        const product = await Product.findById(item.productId).exec();
        if (!product) {
          logger.warn(`Product not found: id=${item.productId}`);
          return next(new AppError(`Product ${item.name} not found`, 404));
        }
        if (product.stock < item.quantity) {
          logger.warn(
            `Insufficient stock for product: id=${item.productId}, name=${item.name}, stock=${product.stock}, requested=${item.quantity}`
          );
          return next(new AppError(`Insufficient stock for ${item.name}`, 400));
        }
        product.stock -= item.quantity;
        product.updatedAt = new Date();
        await product.save();
      }

      const invoiceId = generateInvoiceId();

      // ✅ CASH path: create completed invoice directly, mark paid
      if (paymentMethod === "cash") {
        const invoice = new Sale({
          invoiceId,
          customerId: customerId || null,
          customerName: customerName || "",
          items,
          totalAmount,
          cashierId: user.id,
          cashierName: user.username,
          status: "completed",
          paymentStatus: "paid",
          paymentMethod: "cash",
          createdAt: new Date().toISOString(),
        });
        await invoice.save();

        logger.info(`Cash invoice created: invoiceId=${invoiceId}`);
        return res.status(201).json({
          success: true,
          paymentMethod: "cash",
          invoice: {
            ...(invoice.toObject() as any),
          },
        });
      }

      // ✅ UPI path (Razorpay)
      const orderAmountPaise = Math.max(Math.round(totalAmount * 100), 100);
      const razorpayOrder = await razorpay.orders.create({
        amount: orderAmountPaise,
        currency: "INR",
        receipt: invoiceId,
        notes: {
          customerId: customerId || "guest",
          invoiceId,
        },
      });
      logger.info(`Razorpay order response: ${JSON.stringify(razorpayOrder)}`);

      if (!razorpayOrder) {
        logger.error("Failed to create Razorpay order");
        return next(new AppError("Failed to create Razorpay order", 500));
      }

      const invoice = new Sale({
        invoiceId,
        customerId: customerId || null,
        customerName: customerName || "",
        items,
        totalAmount,
        cashierId: user.id,
        cashierName: user.username,
        status: "pending",
        paymentStatus: "pending",
        paymentMethod: "upi", // ✅ ADDED
        razorpayOrderId: razorpayOrder.id,
        createdAt: new Date().toISOString(),
      });

      await invoice.save();
      logger.info(
        `Invoice created with Razorpay order: invoiceId=${invoiceId}, razorpayOrderId=${razorpayOrder.id}`
      );

      res.status(201).json({
        id: (invoice._id as mongoose.Types.ObjectId).toString(),
        invoiceId: invoice.invoiceId,
        customerId: invoice.customerId?.toString() || null,
        customerName: invoice.customerName,
        items: invoice.items,
        totalAmount: invoice.totalAmount,
        cashierId: invoice.cashierId.toString(),
        cashierName: invoice.cashierName,
        status: invoice.status,
        paymentStatus: invoice.paymentStatus,
        paymentMethod: invoice.paymentMethod, // ✅ ADDED
        razorpayOrderId: razorpayOrder.id,
        razorpayKey: ENV.RAZORPAY_KEY_ID,
        amount: orderAmountPaise,
        currency: "INR",
        createdAt: invoice.createdAt,
      });
    } catch (error: any) {
      logger.error(
        `Error creating invoice with Razorpay: ${
          error && (error.message || JSON.stringify(error))
        }`
      );
      logger.error(
        `Full Razorpay error object: ${JSON.stringify(
          error,
          Object.getOwnPropertyNames(error)
        )}`
      );
      next(
        new AppError(
          "Server error",
          500,
          error && (error.message || JSON.stringify(error))
        )
      );
    }
  }
);

router.post(
  "/verify-payment",
  authenticate,
  [
    body("razorpay_order_id")
      .notEmpty()
      .withMessage("Razorpay order ID required"),
    body("razorpay_payment_id")
      .notEmpty()
      .withMessage("Razorpay payment ID required"),
    body("razorpay_signature")
      .notEmpty()
      .withMessage("Razorpay signature required"),
    body("invoiceId").notEmpty().withMessage("Invoice ID required"),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        `Validation errors in POST /api/invoices/verify-payment: ${JSON.stringify(
          errors.array()
        )}`
      );
      return next(new AppError("Validation errors", 400, errors.array()));
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      invoiceId,
    } = req.body;

    try {
      const invoice = await Sale.findOne({ invoiceId }).exec();
      if (!invoice) {
        logger.warn(`Invoice not found: invoiceId=${invoiceId}`);
        return next(new AppError("Invoice not found", 404));
      }

      const isValid = verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );
      if (!isValid) {
        invoice.paymentStatus = "failed";
        await invoice.save();
        logger.warn(`Invalid payment signature for invoiceId=${invoiceId}`);
        return next(new AppError("Invalid payment signature", 400));
      }

      invoice.paymentStatus = "paid";
      invoice.razorpayPaymentId = razorpay_payment_id;
      invoice.razorpaySignature = razorpay_signature;
      invoice.status = "completed";
      await invoice.save();

      logger.info(
        `Payment verified for invoiceId=${invoiceId}, razorpayPaymentId=${razorpay_payment_id}`
      );
      res.json({
        success: true,
        message: "Payment verified successfully",
        invoice: invoice.toObject(), // Return the updated invoice object
      });
    } catch (error: any) {
      logger.error(`Error verifying payment: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

// ✅ NEW: Stream/Download PDF by invoiceId
router.get(
  "/:invoiceId/pdf",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const invoice = await Sale.findOne({
        invoiceId: req.params.invoiceId,
      })
        .lean()
        .exec();

      if (!invoice) {
        return next(new AppError("Invoice not found", 404));
      }

      await streamInvoicePdf(res, invoice as any);
    } catch (error: any) {
      logger.error(`Failed to stream invoice pdf: ${error.message}`);
      next(new AppError("PDF generation failed", 500));
    }
  }
);

export default router;
