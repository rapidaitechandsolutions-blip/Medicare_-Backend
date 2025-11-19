import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { logger } from "../utils/logger";

// FIX: Added 'export' so this interface can be imported in other files.
export interface IUser extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  username: string;
  password: string;
  name: string;
  role: "admin" | "cashier";
  email?: string; // FIX: Added optional email property
  mobile?: string; // FIX: Added optional mobile property
}

const userSchema = new mongoose.Schema<IUser>(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ["admin", "cashier"], required: true },
    email: { type: String, trim: true }, // FIX: Added email to schema
    mobile: { type: String, trim: true }, // FIX: Added mobile to schema
  },
  { timestamps: false }
);

// The unique: true property above already creates an index.
// The line below was redundant and has been removed.
// userSchema.index({ username: 1 });

export const User = mongoose.model<IUser>("User", userSchema);

export const seedUsers = async () => {
  try {
    const users = [
      {
        username: "admin",
        password: "demo123",
        name: "Admin User",
        role: "admin",
      },
      {
        username: "cashier",
        password: "demo123",
        name: "Cashier User",
        role: "cashier",
      },
    ];

    for (const user of users) {
      const existingUser = await User.findOne({
        username: user.username,
      }).exec();
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await User.create({ ...user, password: hashedPassword });
        logger.info(`Seeded user: ${user.username} (${user.role})`);
      } else {
        logger.info(`User already exists: ${user.username} (${user.role})`);
      }
    }
  } catch (error) {
    logger.error("Error seeding users:", error);
  }
};
