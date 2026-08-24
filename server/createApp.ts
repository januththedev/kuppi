// Builds the Kuppi Express app without binding a port, so the same stack can
// run as a normal Node server (pnpm dev / pnpm start) or as a Vercel
// serverless function (api/index.ts).
//
// mode:
//  - "development" → caller attaches Vite middleware afterwards (see _core/index)
//  - "production"  → caller attaches static serving for single-host deploys
//  - "serverless"  → static hosting + API routing are handled by the platform
//
// NOTE: this module must stay free of anything Vite-related so the serverless
// bundle never traces the frontend toolchain.

import "dotenv/config";
import type { Express } from "express";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { registerLocalStorageFiles } from "./localStorageFiles";
import { registerBlobUploadRoute } from "./blobUploadRoute";
import { registerCliUploadRoutes } from "./cliUploadRoutes";
import { registerFileLinkRoute } from "./fileLinkRoute";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";

export type AppMode = "development" | "production" | "serverless";

export async function createApp(_mode: AppMode): Promise<Express> {
  const app = express();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerLocalStorageFiles(app);
  registerBlobUploadRoute(app);
  registerCliUploadRoutes(app);
  registerFileLinkRoute(app);
  registerOAuthRoutes(app);
  // Simple liveness probe for platform health checks.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: _mode });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}
