import mongoose from "mongoose";

export interface IProduct extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  code?: string;
  category: string;
  price: number;
  stock: number;
  expiryDate?: string;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new mongoose.Schema<IProduct>(
  {
    name: { type: String, required: true },
    code: { type: String, unique: true, sparse: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    expiryDate: { type: String },
  },
  { timestamps: true } // This option automatically adds createdAt and updatedAt fields
);

// Indexes for better query performance
productSchema.index({ name: "text", code: "text", category: "text" });
productSchema.index({ name: 1 });
productSchema.index({ code: 1 });
productSchema.index({ category: 1 });

export const Product = mongoose.model<IProduct>("Product", productSchema);
