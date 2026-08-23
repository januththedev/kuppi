// Vercel serverless entry point. The same Express app that runs via
// `pnpm start` is exported as a request handler; static files are served by
// Vercel's CDN from dist/public (see vercel.json rewrites).
import { createApp } from "../server/createApp";

const app = await createApp("serverless");

export default async function handler(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  app(req, res);
}
