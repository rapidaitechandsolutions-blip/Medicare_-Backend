import { Router, Response, NextFunction } from "express";
import { body, validationResult, param } from "express-validator";
import multer from "multer";
import { SortOrder } from "mongoose"; // ADDED: Import for explicit typing
import { Product } from "../models/product";
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
        const { name, category, price, stock, code, expirydate } = row;
        if (!name || !category || price === undefined || stock === undefined) {
          errors.push(
            `Row ${rowCounter}: Missing required fields (name, category, price, stock).`
          );
          return;
        }
        const numericPrice = Number(price);
        const integerStock = Math.round(Number(stock));
        if (isNaN(numericPrice) || numericPrice < 0) {
          errors.push(
            `Row ${rowCounter}: Invalid price value "${price}". Must be a non-negative number.`
          );
          return;
        }
        if (isNaN(integerStock) || integerStock < 0) {
          errors.push(
            `Row ${rowCounter}: Invalid stock value "${stock}". Must be a non-negative integer.`
          );
          return;
        }
        const filterKey = code ? { code: code } : { name: name };
        operations.push({
          updateOne: {
            filter: filterKey,
            update: {
              $set: {
                name,
                code: code || null,
                category,
                price: numericPrice,
                stock: integerStock,
                expiryDate: expirydate || null,
              },
            },
            upsert: true,
          },
        });
      })
      .on("end", async () => {
        try {
          let successCount = 0;
          if (operations.length > 0) {
            const result = await Product.bulkWrite(operations);
            successCount = result.upsertedCount + result.modifiedCount;
            logger.info(
              `Product bulk import by user ${req.user?.username}. Success: ${successCount}, Errors: ${errors.length}`
            );
          }
          res.status(200).json({ success: successCount, errors });
        } catch (dbError: any) {
          if (dbError.code === 11000) {
            errors.push(
              `Database error: A duplicate product code or name was found. Please ensure all product codes are unique.`
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

router.get(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);
      const skip = (page - 1) * limit;

      const query: any = {};

      if (req.query.search) {
        const searchRegex = new RegExp(req.query.search as string, "i");
        query.$or = [
          { name: searchRegex },
          { code: searchRegex },
          { category: searchRegex },
        ];
      }

      if (req.query.category) {
        query.category = {
          $regex: new RegExp(req.query.category as string, "i"),
        };
      }

      const sortField = (req.query.sort as string) || "createdAt";
      const sortOrderValue = (req.query.order as string) === "asc" ? 1 : -1;
      // FIXED: Explicitly typed sortOptions to satisfy Mongoose's .sort() method
      const sortOptions: { [key: string]: SortOrder } = {
        [sortField]: sortOrderValue,
      };

      const products = await Product.find(query)
        .sort(sortOptions) // Use dynamic sort options
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
      const totalProducts = await Product.countDocuments(query);
      const totalPages = Math.ceil(totalProducts / limit);

      logger.info(
        `Fetched ${products.length} products for user: ${req.user?.username}`
      );

      res.json({
        products: products.map((product) => ({
          id: product._id.toString(),
          name: product.name,
          code: product.code,
          category: product.category,
          price: product.price,
          stock: product.stock,
          expiryDate: product.expiryDate,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        })),
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalItems: totalProducts,
        },
      });
    } catch (error: any) {
      logger.error(`Error fetching products: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

router.post(
  "/",
  authenticate,
  restrictToAdmin,
  [
    body("name").notEmpty().withMessage("Name is required").trim().escape(),
    body("code").optional().trim().escape(),
    body("category")
      .notEmpty()
      .withMessage("Category is required")
      .trim()
      .escape(),
    body("price")
      .isFloat({ min: 0 })
      .withMessage("Price must be a non-negative number"),
    body("stock")
      .isInt({ min: 0 })
      .withMessage("Stock must be a non-negative integer"),
    body("expiryDate")
      .optional({ checkFalsy: true })
      .isISO8601()
      .withMessage("Invalid date format"),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        `Validation errors in POST /api/products: ${JSON.stringify(
          errors.array()
        )}`
      );
      return next(new AppError("Validation errors", 400, errors.array()));
    }
    const { name, code, category, price, stock, expiryDate } = req.body;
    logger.info(
      `Adding product: name=${name}, category=${category} by user: ${req.user?.username}`
    );
    try {
      const orConditions = [{ name }];
      if (code) {
        orConditions.push({ code } as any);
      }
      const existingProduct = await Product.findOne({ $or: orConditions })
        .lean()
        .exec();
      if (existingProduct) {
        const message =
          existingProduct.name === name
            ? `Product with name "${name}" already exists`
            : `Product with code "${code}" already exists`;
        logger.warn(message);
        return next(new AppError(message, 409));
      }
      const product = new Product({
        name,
        code,
        category,
        price,
        stock,
        expiryDate,
      });
      await product.save();
      logger.info(`Product created: name=${name}, category=${category}`);
      res.status(201).json({
        id: product._id.toString(),
        name: product.name,
        code: product.code,
        category: product.category,
        price: product.price,
        stock: product.stock,
        expiryDate: product.expiryDate,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      });
    } catch (error: any) {
      logger.error(`Error creating product: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

router.patch(
  "/:id",
  authenticate,
  restrictToAdmin,
  [
    param("id").isMongoId().withMessage("Invalid product ID"),
    body("name")
      .optional()
      .notEmpty()
      .withMessage("Name cannot be empty")
      .trim()
      .escape(),
    body("category")
      .optional()
      .notEmpty()
      .withMessage("Category cannot be empty")
      .trim()
      .escape(),
    body("price")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Price must be a non-negative number"),
    body("stock")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Stock must be a non-negative integer"),
    body("expiryDate")
      .optional({ checkFalsy: true })
      .isISO8601()
      .withMessage("Invalid date format"),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        `Validation errors in PATCH /api/products/:id: ${JSON.stringify(
          errors.array()
        )}`
      );
      return next(new AppError("Validation errors", 400, errors.array()));
    }
    const { id } = req.params;
    const updateData = req.body;
    try {
      const product = await Product.findById(id).exec();
      if (!product) {
        logger.warn(`Product not found: id=${id}`);
        return next(new AppError("Product not found", 404));
      }
      if (updateData.name && updateData.name !== product.name) {
        const existingProduct = await Product.findOne({
          name: updateData.name,
          _id: { $ne: id },
        })
          .lean()
          .exec();
        if (existingProduct) {
          logger.warn(`Product name ${updateData.name} already in use`);
          return next(new AppError("Product name already in use", 409));
        }
      }
      if (updateData.code && updateData.code !== product.code) {
        const existingProduct = await Product.findOne({
          code: updateData.code,
          _id: { $ne: id },
        })
          .lean()
          .exec();
        if (existingProduct) {
          logger.warn(`Product code ${updateData.code} already in use`);
          return next(new AppError("Product code already in use", 409));
        }
      }
      Object.assign(product, updateData);
      await product.save();
      logger.info(`Product updated: id=${id}, name=${product.name}`);
      res.json({
        id: product._id.toString(),
        name: product.name,
        code: product.code,
        category: product.category,
        price: product.price,
        stock: product.stock,
        expiryDate: product.expiryDate,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      });
    } catch (error: any) {
      logger.error(`Error updating product: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

router.delete(
  "/:id",
  authenticate,
  restrictToAdmin,
  [param("id").isMongoId().withMessage("Invalid product ID")],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    try {
      const product = await Product.findById(id).exec();
      if (!product) {
        logger.warn(`Product not found: id=${id}`);
        return next(new AppError("Product not found", 404));
      }
      await Product.deleteOne({ _id: id }).exec();
      logger.info(`Product deleted: id=${id}, name=${product.name}`);
      res.status(204).send();
    } catch (error: any) {
      logger.error(`Error deleting product: ${error.message}`);
      next(new AppError("Server error", 500, error.message));
    }
  }
);

export default router;
