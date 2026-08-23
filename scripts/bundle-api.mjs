// Bundles the serverless handler into a single self-contained-ish ESM file
// (dist-api/index.mjs) that api/index.ts re-exports. This keeps Vercel's
// TypeScript compilation trivial: it only ever compiles the tiny api/index.ts.
import { build } from "esbuild";

await build({
  entryPoints: ["server/lambdaHandler.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: "dist-api/index.mjs",
  sourcemap: false,
  logLevel: "warning",
  tsconfig: "tsconfig.json",
});

// Type shim so `pnpm check` accepts the .mjs import from api/index.ts.
await import("node:fs").then(({ writeFileSync }) => {
  writeFileSync(
    "dist-api/index.d.mts",
    "declare const handler: (req: unknown, res: unknown) => Promise<void>;\nexport default handler;\n",
  );
});

console.log("dist-api/index.mjs bundled");
