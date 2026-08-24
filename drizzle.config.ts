import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// Managed MySQL providers (e.g. Aiven) advertise ssl-mode=REQUIRED in their
// URI; mysql2 must then be told to encrypt without CA verification unless a
// provider CA is supplied.
const requiresSsl = connectionString.includes("ssl-mode=REQUIRED");

function credentials() {
  if (!requiresSsl) return { url: connectionString };
  // drizzle-kit drops a separate ssl option when it is handed a URL string
  // (it explodes the URL into connection options instead), which makes
  // require-SSL servers reject migrations with a misleading "access denied".
  // Explicit fields keep our TLS setting intact.
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  };
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: credentials(),
});
