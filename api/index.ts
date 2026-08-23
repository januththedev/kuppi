// Vercel serverless entry. The real handler is pre-bundled by
// `scripts/bundle-api.mjs` (part of `pnpm build`) into dist-api/index.mjs —
// this file stays trivial on purpose so the platform's TypeScript step has
// nothing to mis-compile.
export { default } from "../dist-api/index.mjs";

// Allow slow first connections (managed-MySQL TLS handshake, cold starts).
export const config = { maxDuration: 30 };
