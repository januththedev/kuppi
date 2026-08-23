# Kuppi — Technical Audit & Improvement Register

Date: 2026-08-23 · Auditor: ox-alpha (autonomous enhancement run)
Scope: full repository audit before the production-readiness improvement pass.

---

## 1. Current-state map

```text
KUPPI (React 19 + Vite 7 + TS 5.9 + Tailwind v4 + shadcn/Radix + framer-motion)
│
├── Pages
│   ├── Home (/)            landing + public library feed + auth/upload/detail modals
│   ├── Dashboard (/dashboard) student workspace: stats, discovery controls, 3 panels
│   └── AdminModeration (/admin/moderation) report queue: dismiss / hide / remove
│
├── Components
│   ├── DashboardLayout      sidebar shell + auth wall
│   ├── DocumentPreview      file preview + reading progress + AI quiz + related notes
│   ├── RelatedNotes         ⚠ DEAD CODE (duplicated inside DocumentPreview, never imported)
│   ├── AccountRecovery      identity-matched password reset modal
│   └── ui/*                 shadcn primitives (~60 files)
│
├── Data layer (tRPC over Express, Drizzle ORM → MySQL)
│   ├── routers.ts           account / resource / dashboard / learning / moderation
│   ├── kuppiDb.ts           resource queries + engagement decoration
│   ├── quizDb.ts            quizzes, attempts, reading progress
│   ├── moderationDb.ts      content reports + resolution
│   └── kuppiAuth.ts         scrypt hashing, JWT session cookie (httpOnly)
│
├── Integrations
│   ├── Manus Forge storage (S3 presign) via server/storage.ts
│   ├── OpenRouter MCQ generation (server/openRouterQuiz.ts, key server-side only)
│   └── pdf-parse + tesseract.js text extraction for quizzes
│
├── Styling
│   ├── client/src/index.css hand-rolled design language:
│   │   cream paper #f8f5ef, ink #292142, violet #5b35e8, Fraunces + DM Sans
│   └── Tailwind v4 utilities inline in JSX
│
├── Tests — vitest, 10 files / 20 tests, ALL PASSING
├── Deployment — dev: tsx watch + Vite middleware; prod: vite build + esbuild bundle
└── Platform scaffolding — Manus template (_core/*), analytics placeholders
```

Baseline verification performed locally: `pnpm check` ✓ · `pnpm test` 20/20 ✓ ·
MySQL 8 (Docker) migrated ✓ · dev server serves on :3100 ✓

## 2. What is already good

- Coherent, distinctive visual identity (warm paper + violet + Fraunces serif) — worth preserving and deepening.
- Clean backend structure: typed tRPC procedures, validated inputs, parameterized Drizzle queries, scrypt+JWT auth with httpOnly cookies.
- Real-content policy enforced end to end; empty states are honest and helpful.
- Moderation model with status enums and indexed tables; sensible upload safety caps.
- Test suite covers auth, recovery, workflows, filtering, search history.

## 3. Prioritized issue register

### P0 — Critical (broken / blocking)
| # | Issue | Where |
|---|-------|-------|
| P0-1 | `dev`/`start` scripts use Unix env prefixes → app cannot start on Windows | package.json ✅ FIXED (cross-env) |
| P0-2 | pnpm ≥10 ignores `package.json#pnpm` → wouter patch silently dropped | pnpm-workspace.yaml ✅ FIXED |
| P0-3 | Uploads impossible without Manus Forge credentials (`storagePut` throws; `/manus-storage/*` returns 500). Self-hosted deployments have no working storage. | server/storage.ts, storageProxy.ts |
| P0-4 | index.html ships `%VITE_ANALYTICS_ENDPOINT%` placeholder script → broken request in any non-Manus deploy + stale template comment | client/index.html |

### P1 — High (integrity, UX, correctness)
| # | Issue | Where |
|---|-------|-------|
| P1-1 | Quiz scoring trusts client-supplied `correctIndexes` → students can submit perfect scores arbitrarily; answer key also leaks to client | routers.ts `submitQuiz`, DocumentPreview.tsx |
| P1-2 | Report flow uses `window.prompt` — jarring, unstyled, no reason presets | Home.tsx `reportContent` |
| P1-3 | No page-level SEO/meta beyond title/description: no OG/Twitter tags, no canonical, no theme-color, dead Google Fonts comment block | client/index.html |
| P1-4 | Design is flat/static: no depth, motion, or scroll narrative → reads as generic template despite good palette (user explicitly wants a dimensional, non-generic look) | global CSS / Home hero & cards |
| P1-5 | `.env.example` absent — self-hosters must reverse-engineer required vars (DATABASE_URL, JWT_SECRET, Forge/OpenRouter optionals) | repo root |

### P2 — Medium
| # | Issue | Where |
|---|-------|-------|
| P2-1 | `getDashboard` loads *all* students/resources/likes each call — fine now, O(N) later | kuppiDb.ts |
| P2-2 | Dead code: RelatedNotes.tsx duplicates inline section in DocumentPreview.tsx; `any` types in both | components |
| P2-3 | Search history save fires onBlur on every focus (noise); minor | Dashboard.tsx |
| P2-4 | No README.md in repo (only SCALABILITY/SELF_HOSTING docs) | repo root |
| P2-5 | Resource cards lack keyboard-focus styles on nested buttons; some contrast ratios borderline (small gray text) | Home.tsx, index.css |

### P3 — Nice to have
- Dark mode (theme infra exists but unused).
- Animated stat counters, marquee of latest uploads.
- Admin role has no UI path to grant (DB-only operation) — document.

## 4. Enhancement direction (approved by owner)

Owner requirement: *"I don't want a generic AI-made look. I need 3D effects and things."*

Plan: keep the warm-paper/violet/Fraunces identity and add a real depth system:
1. **Three.js hero scene** (lazy-loaded, ~dynamically imported): floating "knowledge shards"/book-like geometry in brand colors, mouse parallax + gentle drift, DPR-capped, paused off-screen, static gradient fallback under `prefers-reduced-motion`.
2. **CSS 3D card system**: perspective tilt-on-hover + cursor spotlight for resource cards; layered translateZ for the hero file stack.
3. **Motion system**: framer-motion staggered reveals per section, kinetic headline emphasis, magnetic primary CTAs — Level 1–3 hierarchy, everything gated by `prefers-reduced-motion` and disabled on low-power/mobile where heavy.
4. **Depth tokens**: layered shadows, glass surfaces, subtle noise/grain for the paper feel.

## 5. Verification plan

After implementation: clean prod build; browser-driven QA of register/login/upload/view/comment/like/save/report/moderation/recovery flows against Docker MySQL; responsive screenshots at 375/768/1440; console-error sweep; final §60 checklist.
