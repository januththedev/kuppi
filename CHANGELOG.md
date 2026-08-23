# Changelog

Notable changes to Kuppi. Newest first. Maintained so future developers (human or AI)
can understand what changed, why, and how it was verified.

## 2026-08-23 (later — glassmorphism pass + production click fix)

### P0 fix: production build was unusable — pointer clicks did nothing
**Found by GUI testing:** in the built site, mouse clicks focused buttons but never
fired React handlers (keyboard Enter worked). Root cause: `vite-plugin-manus-runtime`
injected a ~367 KB Manus-platform instrumentation script into every production page,
which swallowed pointer events outside the Manus host.
**Change:** removed `vitePluginManusRuntime` (and the Manus-only jsx-loc attribute
plugin stays for now); the dev-only debug collector is now gated by Vite build mode;
`pnpm build` pins `NODE_ENV=production` via cross-env so dev tooling can never leak
into dist again.
**Verified:** rebuilt HTML contains zero Manus scripts (`grep manus dist/public/index.html` = 0).
**Affected:** `vite.config.ts`, `package.json`.

### Hero: animations removed, quiet glassmorphism added
**Change:** per owner feedback the hero's entrance/float animations were removed
(headline renders instantly; file panels are static frosted-glass layers with
translateZ depth). Restrained glassmorphism applied to hero file stack, eyebrow chip.
Three.js backdrop kept but recomposed: shards biased to the right art column,
pushed back and shrunk so headline copy stays readable; glass opacity/blur raised
so panels read clearly over the scene.
**Affected:** `client/src/pages/Home.tsx`, `client/src/components/HeroScene.tsx`,
`client/src/index.css`.
**Testing:** tsc clean; production build green; deployed locally on :3200.

## 2026-08-23

### 3D depth identity (visual overhaul)
**Change:** Homepage redesigned with a real depth system — lazy-loaded Three.js hero
scene (floating brand-colored note shards + additive study dust, pointer parallax,
scroll drift), perspective-tilt resource cards with cursor spotlight, kinetic 3D
headline flip-in, staggered hero entrance, scroll-reveal sections, floating layered
hero file stack, aurora hero wash, subtle paper grain, living CTA gradient, deeper
card shadows.
**Why:** Owner asked for a distinctive, non-generic look with genuine 3D effects.
**Affected:** `client/src/components/HeroScene.tsx` (new), `client/src/hooks/useTilt.ts`
(new), `client/src/pages/Home.tsx`, `client/src/index.css`, `package.json` (+`three`).
**Accessibility/perf:** Everything respects `prefers-reduced-motion` (static frame /
no tilt / no grain); scene pauses when off-screen or tab hidden; DPR capped; three.js
ships as its own lazy chunk only loaded on the homepage.
**Testing:** `tsc --noEmit` clean · vitest 20/20 · production build green.

### Security: server-side quiz grading
**Change:** `learning.submitQuiz` no longer accepts client-supplied `correctIndexes`;
it grades against the stored `questionsJson`. `learning.generateQuiz*` no longer
returns the answer key (`correctIndex`/`explanation`) to the browser — the submit
response carries a per-question review instead.
**Why:** The old contract let a student POST arbitrary "correct" indexes for a perfect
score and leaked the answer key to anyone who opened devtools.
**Affected:** `server/routers.ts`, `server/quizDb.ts` (+`getQuizById`),
`client/src/components/DocumentPreview.tsx`.
**Testing:** tsc clean · vitest 20/20.

### Self-hosted storage mode (P0)
**Change:** Without Manus Forge credentials, uploads now write to local disk under
`KUPPI_STORAGE_DIR` (default `./storage-data/`) and are served at `/api/storage-files/*`
with content-type detection and path-traversal guards. Legacy `/manus-storage/*` URLs
307-redirect to the local endpoint. Quiz text extraction reads files directly from
disk in this mode.
**Why:** Uploads previously threw immediately without Forge env vars — self-hosted
deployments had no working storage at all.
**Affected:** `server/storage.ts`, `server/localStorageFiles.ts` (new),
`server/_core/storageProxy.ts`, `server/_core/index.ts`, `server/resourceTextExtraction.ts`,
`.gitignore`.
**Testing:** End-to-end API smoke test: register → upload → fetch file back over HTTP
against Dockerized MySQL 8 (correct bytes, headers, and redirect).

### Windows compatibility + pnpm 10 settings (P0)
**Change:** `dev`/`start` scripts use `cross-env` for `NODE_ENV`; pnpm
`patchedDependencies`/`overrides` migrated from `package.json#pnpm` to
`pnpm-workspace.yaml`; build scripts allowlisted.
**Why:** Unix-style env prefixes broke `pnpm dev`/`pnpm start` on Windows; pnpm ≥10
ignores `package.json#pnpm`, silently dropping the wouter patch.
**Affected:** `package.json`, `pnpm-workspace.yaml` (new).
**Testing:** Full install + typecheck + tests + build run on Windows 11 / Node 24.

### UX: proper report modal
**Change:** Replaced `window.prompt` reporting with an in-app modal offering reason
presets (inappropriate, not study material, spam, copyright, other) plus optional
details, wired to the existing moderation API.
**Affected:** `client/src/pages/Home.tsx`, `client/src/index.css`.

### SEO/meta & docs
**Change:** `client/index.html` cleaned of Manus analytics placeholders and stale
template comments; added Open Graph/Twitter meta, theme-color, preconnects, and an
inline SVG brand favicon. Added `README.md`, `.env.example`, `AUDIT.md` (full audit:
current-state map + P0–P3 register). Dead code removed (`RelatedNotes.tsx`,
unused CSS).

### Performance
**Change:** Vendor manualChunks split (react/trpc/motion/ui) for better caching;
three.js already isolated via dynamic import.
**Affected:** `vite.config.ts`.
**Testing:** Production build green; chunk sizes reviewed.

## Known limitations (honest list)

- Account recovery matches full name + contact number + username — convenient but add
  real email/SMS verification before any public production launch.
- AI quizzes require `OPENROUTER_API_KEY`; untestable end-to-end until provided.
- `getDashboard` loads all students/resources/likes per call — fine at current scale,
  documented in SCALABILITY.md as future SQL-aggregation work.
