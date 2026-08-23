import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// Managed MySQL providers (e.g. Aiven) advertise ssl-mode=REQUIRED in their
// URI; mysql2 must then be told to encrypt without CA verification unless a
// provider CA is supplied.
const requiresSsl = connectionString.includes("ssl-mode=REQUIRED");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
    ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  },
});
