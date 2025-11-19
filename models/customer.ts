import mongoose from "mongoose";

export interface ICustomer extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  mobile: string;
  address: string;
  email: string;
  loyaltyPoints: number;
  createdAt: Date; // CHANGED: from string to Date
  updatedAt: Date; // CHANGED: from string to Date
}

const customerSchema = new mongoose.Schema<ICustomer>(
  {
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    address: { type: String, default: "" },
    email: { type: String, default: "" },
    loyaltyPoints: { type: Number, default: 0 },
  },
  { timestamps: true } // CHANGED: from false to true to enable automatic timestamps
);

customerSchema.index({ mobile: 1 }); // Index for faster queries

export const Customer = mongoose.model<ICustomer>("Customer", customerSchema);
