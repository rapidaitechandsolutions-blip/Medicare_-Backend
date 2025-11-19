import mongoose, { Document, Schema } from "mongoose";

// Interface describing the settings document
export interface ISettings extends Document {
  businessName: string;
  address: string;
  contact: string; // Changed from 'phone' to 'contact'
  email: string;
  website?: string;
  taxRate: number; // Store as a percentage, e.g., 5 for 5%
  currency: string; // Changed from 'currencySymbol' to 'currency'
  logo?: string;
  gstin?: string;
  // Added fields to match frontend state
  theme: "light" | "dark" | "system";
  language: string;
}

const settingsSchema = new Schema<ISettings>(
  {
    businessName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    contact: { type: String, required: true, trim: true }, // Changed from 'phone'
    email: { type: String, required: true, trim: true, lowercase: true },
    website: { type: String, trim: true },
    taxRate: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, required: true, trim: true, default: "₹" }, // Changed from 'currencySymbol'
    logo: { type: String },
    gstin: { type: String, trim: true },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "light",
    },
    language: { type: String, default: "en" },
  },
  { timestamps: true }
);

// Create and export the Settings model
const Settings = mongoose.model<ISettings>("Settings", settingsSchema);

export default Settings;