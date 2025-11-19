import mongoose from "mongoose";

export interface ISale extends mongoose.Document {
  invoiceId: string;
  customerId?: mongoose.Types.ObjectId | null;
  customerName: string;
  items: Array<{
    productId: mongoose.Types.ObjectId;
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  totalAmount: number;
  cashierId: mongoose.Types.ObjectId;
  cashierName: string;
  status: "pending" | "completed" | "cancelled";
  paymentStatus: "pending" | "paid" | "failed";
  // ✅ ADDED: paymentMethod
  paymentMethod: "cash" | "upi";
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  createdAt: Date;
  updatedAt?: Date;
}

const saleSchema = new mongoose.Schema<ISale>(
  {
    invoiceId: { type: String, required: true, unique: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    customerName: { type: String, default: "" },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        total: { type: Number, required: true },
      },
    ],
    totalAmount: { type: Number, required: true },
    cashierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cashierName: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    // ✅ ADDED: paymentMethod enum
    paymentMethod: {
      type: String,
      enum: ["cash", "upi"],
      default: "upi",
    },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
  },
  { timestamps: true }
);

saleSchema.index({ invoiceId: 1 });
// OPTIMIZATION: Indexing createdAt for faster analytics and reporting queries
saleSchema.index({ createdAt: -1 });

export const Sale = mongoose.model<ISale>("Sale", saleSchema);
