// The actual serverless handler. api/index.ts re-exports this from a
// pre-bundled file (dist-api/index.mjs, built by scripts/bundle-api.mjs) so
// the platform never has to compile the app's TypeScript itself.
import type { Express } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./createApp";

// Memoized so cold starts initialize once; a failed init is retried on the
// next request and logged instead of silently crashing the function.
let appPromise: Promise<Express> | null = null;
function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = createApp("serverless").catch((error) => {
      console.error("[Kuppi] app initialization failed:", error);
      appPromise = null;
      throw error;
    });
  }
  return appPromise;
}

export async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    await new Promise<void>((resolve, reject) => {
      res.on("finish", resolve);
      app(req as Parameters<Express>[0], res as Parameters<Express>[1], (error?: unknown) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } catch (error) {
    // Always answer in JSON so the tRPC client can surface a real message.
    console.error("[Kuppi] request failed:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: { message: "Kuppi server error. Check the deployment logs." } }));
    } else {
      res.end();
    }
  }
}

export default handler;
