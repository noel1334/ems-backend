import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

const prisma = new PrismaClient({
  log:
    env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error", "warn"],
});

export const connectDatabase = async () => {
  try {
    await prisma.$connect();

    console.log("✅ PostgreSQL database connected");
  } catch (error) {
    console.error("❌ Database connection failed:", error);

    process.exit(1);
  }
};

export const disconnectDatabase = async () => {
  await prisma.$disconnect();
};

export default prisma;
