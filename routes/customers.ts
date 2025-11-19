import { Router, Response, NextFunction } from "express";
import { body, validationResult, param } from "express-validator";
import multer from "multer";
import { Customer } from "../models/customer";
import {
  authenticate,
  restrictToAdmin,
  AuthenticatedRequest,
} from "../middleware/auth";
import { logger } from "../utils/logger";
import { AppError } from "../utils/error";
import csv from "csv-parser";
import { Readable } from "stream";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET all customers
router.get(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);
      const search = req.query.search as string;
      const skip = (page - 1) * limit;
      let query = {};
      if (search) {
        const searchRegex = new RegExp(search, "i");
        query = {
          $or: [{ name: searchRegex }, { mobile: searchRegex }],
        };
      }
      const customers = await Customer.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
      const totalCustomers = await Customer.countDocuments(query);
      const totalPages = Math.ceil(totalCustomers / limit);
      logger.info(
        `Fetched ${customers.length} customers for user: ${req.user?.username}`
      );
      res.json({
        customers: customers.map((customer) => ({
          id: customer._id.toString(),
          name: customer.name,
          mobile: customer.mobile,
          address: customer.address,
          email: customer.email,
          loyaltyPoints: customer.loyaltyPoints,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        })),
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalItems: totalCustomers,
        },
      });
    } catch (error: any) {
      logger.error(`Error fetching customers: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

// POST a new customer
router.post(
  "/",
  authenticate,
  [
    body("name", "Name is required").notEmpty().trim().escape(),
    body("mobile")
      .notEmpty()
      .withMessage("Mobile number is required")
      .isMobilePhone("any", { strictMode: false })
      .withMessage("Invalid mobile number format"),
    body("email")
      .optional({ checkFalsy: true })
      .isEmail()
      .withMessage("Invalid email format")
      .normalizeEmail(),
    body("address")
      .optional()
      .isString()
      .withMessage("Address must be a string")
      .trim()
      .escape(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        `Validation errors in POST /api/customers: ${JSON.stringify(
          errors.array()
        )}`
      );
      return next(new AppError("Validation errors", 400, errors.array()));
    }
    const { name, mobile, email, address } = req.body;
    logger.info(
      `Adding customer: name=${name}, mobile=${mobile} by user: ${req.user?.username}`
    );
    try {
      const existingCustomer = await Customer.findOne({ mobile }).lean().exec();
      if (existingCustomer) {
        logger.warn(`Customer with mobile ${mobile} already exists`);
        return next(
          new AppError("Customer with this mobile number already exists", 409)
        );
      }
      const customer = new Customer({
        name,
        mobile,
        email: email || undefined,
        address: address || undefined,
        loyaltyPoints: 0,
      });
      await customer.save();
      logger.info(`Customer created: name=${name}, mobile=${mobile}`);
      res.status(201).json({
        id: customer._id.toString(),
        name: customer.name,
        mobile: customer.mobile,
        address: customer.address,
        email: customer.email,
        loyaltyPoints: customer.loyaltyPoints,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      });
    } catch (error: any) {
      logger.error(`Error creating customer: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

// PATCH an existing customer
router.patch(
  "/:id",
  authenticate,
  restrictToAdmin,
  [
    param("id").isMongoId().withMessage("Invalid customer ID"),
    body("name")
      .optional()
      .notEmpty()
      .withMessage("Name cannot be empty")
      .trim()
      .escape(),
    body("mobile")
      .optional()
      .isMobilePhone("any", { strictMode: false })
      .withMessage("Invalid mobile number format"),
    body("email")
      .optional({ checkFalsy: true })
      .isEmail()
      .withMessage("Invalid email format")
      .normalizeEmail(),
    body("address")
      .optional()
      .isString()
      .withMessage("Address must be a string")
      .trim()
      .escape(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        `Validation errors in PATCH /api/customers/:id: ${JSON.stringify(
          errors.array()
        )}`
      );
      return next(new AppError("Validation errors", 400, errors.array()));
    }
    const { id } = req.params;
    const updateData = req.body;
    try {
      const customer = await Customer.findById(id).exec();
      if (!customer) {
        logger.warn(`Customer not found: id=${id}`);
        return next(new AppError("Customer not found", 404));
      }
      if (updateData.mobile && updateData.mobile !== customer.mobile) {
        const existingCustomer = await Customer.findOne({
          mobile: updateData.mobile,
        })
          .lean()
          .exec();
        if (existingCustomer) {
          logger.warn(
            `Mobile number ${updateData.mobile} already in use by another customer`
          );
          return next(new AppError("Mobile number already in use", 409));
        }
      }
      Object.assign(customer, updateData);
      await customer.save();
      logger.info(`Customer updated: id=${id}, name=${customer.name}`);
      res.json({
        id: customer._id.toString(),
        name: customer.name,
        mobile: customer.mobile,
        address: customer.address,
        email: customer.email,
        loyaltyPoints: customer.loyaltyPoints,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      });
    } catch (error: any) {
      logger.error(`Error updating customer: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

// DELETE a customer
router.delete(
  "/:id",
  authenticate,
  restrictToAdmin,
  [param("id").isMongoId().withMessage("Invalid customer ID")],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    try {
      const customer = await Customer.findByIdAndDelete(id).exec();
      if (!customer) {
        logger.warn(`Customer not found: id=${id}`);
        return next(new AppError("Customer not found", 404));
      }
      logger.info(`Customer deleted: id=${id}, name=${customer.name}`);
      res.status(204).send();
    } catch (error: any) {
      logger.error(`Error deleting customer: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

router.post(
  "/bulk-import",
  authenticate,
  restrictToAdmin,
  upload.single("file"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.file) {
      return next(new AppError("No CSV file provided", 400));
    }
    const operations: any[] = [];
    const errors: string[] = [];
    let rowCounter = 1;
    const stream = Readable.from(req.file.buffer);
    stream
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase(),
        })
      )
      .on("data", (row) => {
        rowCounter++;
        const { name, mobile, email, address, loyaltypoints } = row;
        if (!name || !mobile) {
          errors.push(
            `Row ${rowCounter}: Missing required fields (name, mobile).`
          );
          return;
        }
        operations.push({
          updateOne: {
            filter: { mobile },
            update: {
              $set: {
                name,
                mobile,
                email: email || "",
                address: address || "",
                loyaltyPoints: Number(loyaltypoints) || 0,
              },
              // REMOVED: No need to manually set createdAt/updatedAt
              // Mongoose with `timestamps: true` handles this automatically.
            },
            upsert: true,
          },
        });
      })
      .on("end", async () => {
        try {
          let successCount = 0;
          if (operations.length > 0) {
            const result = await Customer.bulkWrite(operations);
            successCount = result.upsertedCount + result.modifiedCount;
            logger.info(
              `Customer bulk import by user ${req.user?.username}. Success: ${successCount}, Errors: ${errors.length}`
            );
          }
          res.status(200).json({ success: successCount, errors });
        } catch (dbError: any) {
          if (dbError.code === 11000) {
            errors.push(
              `Database error: A duplicate mobile number was found. Please ensure all mobile numbers are unique.`
            );
            res.status(409).json({ success: 0, errors });
          } else {
            logger.error(
              `Database error during bulk write: ${dbError.message}`
            );
            next(
              new AppError(
                "Database error during bulk import.",
                500,
                dbError.message
              )
            );
          }
        }
      })
      .on("error", (err) => {
        logger.error(`CSV parsing error: ${err.message}`);
        next(new AppError("Error parsing CSV file.", 400, err.message));
      });
  }
);

export default router;
