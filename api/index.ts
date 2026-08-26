// Vercel serverless entry. The real handler is pre-bundled by
// `scripts/bundle-api.mjs` (part of `pnpm build`) into dist-api/index.mjs —
// this file stays trivial on purpose so the platform's TypeScript step has
// nothing to mis-compile.
export { default } from "../dist-api/index.mjs";

// 60s headroom: the first AI read of a note may OCR/parse the file and
// generate hashtags inline (server/autoTagger.ts); results are cached in
// MariaDB so later requests are instant.
export const config = { maxDuration: 60 };
