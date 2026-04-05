import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

// Use absolute path to ensure SQLite database is found regardless of working directory
// Database is in root directory (dev.db), matching DATABASE_URL in .env
const dbPath = path.join(process.cwd(), "dev.db");

const adapter = new PrismaLibSql({
  url: `file:${dbPath}`,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
