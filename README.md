# Kuppi

**Learn. Share. Grow together.** A real-content notes and study-resource platform for
Sri Lankan students — built around uploads that actually help, honest engagement, and
a student dashboard that keeps your study momentum going.

Proudly presented by **Januth Nimnal**.

## What Kuppi does

- **Real library** — the public feed starts empty and grows only from genuine student uploads. No seeded or fake content.
- **Student accounts** — username/password registration with live username availability, salted (scrypt) password hashing, and signed HTTP-only session cookies.
- **Uploads & previews** — PDFs, text, images, audio, and video preview in-browser where supported; everything else gets a safe open/download fallback.
- **Community** — comments, likes, saves, copy-link sharing, and reporting with an administrator moderation queue.
- **Student dashboard** — personal stats, contribution rank, saved resources, uploads, recently viewed notes, keyword search, subject/level filters, sorting, and privacy-conscious recent-search history (pinned searches included).
- **Study continuity** — reading-progress markers on PDFs/images and resume links from the dashboard.
- **AI MCQ quizzes** *(optional)* — for eligible PDF/image resources, Kuppi extracts the text (pdf-parse / tesseract.js OCR) and generates source-grounded multiple-choice quizzes via OpenRouter. Grading happens server-side; the answer key never reaches the browser.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS v4, shadcn/Radix UI, framer-motion, Three.js hero scene |
| Backend | Express + tRPC, Node.js |
| Data | MySQL via Drizzle ORM (`drizzle/` migrations) |
| Auth | scrypt password hashing + JWT session cookie (jose) |
| Storage | Manus Forge S3 presign **or** self-hosted local-disk mode |
| Tests | Vitest |

## Running locally

```bash
cp .env.example .env      # then edit DATABASE_URL + JWT_SECRET
pnpm install
pnpm db:push              # generate + apply drizzle migrations
pnpm dev                  # http://localhost:3100
```

Quick database option: `docker run -d --name kuppi-mysql -e MYSQL_ROOT_PASSWORD=kuppi_local -e MYSQL_DATABASE=kuppi -p 3306:3306 mysql:8`

### Environment variables

See [.env.example](./.env.example). Required: `DATABASE_URL`, `JWT_SECRET`.
Optional: `OPENROUTER_API_KEY` (enables AI quizzes), `BUILT_IN_FORGE_API_URL` +
`BUILT_IN_FORGE_API_KEY` (Manus storage; leave empty to use local disk storage).

## Scripts

```bash
pnpm dev     # development server (Express + Vite middleware)
pnpm build   # production build → dist/public + bundled server in dist/
pnpm start   # run the production bundle
pnpm check   # typecheck
pnpm test    # vitest suite
pnpm db:push # drizzle-kit generate + migrate
```

## Deploying to Vercel

See [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) — the repo ships with a serverless entry (api/index.ts), vercel.json routing, and Vercel Blob upload support.

## Self-hosting notes

- Without Forge credentials, uploads are written to `storage-data/` (configurable via
  `KUPPI_STORAGE_DIR`) and served by the app at `/api/storage-files/*`.
- AI quizzes require `OPENROUTER_API_KEY`; everything else works without it.
- Account recovery matches full name + contact number + username. Convenient, but add
  email/SMS verification before any public production launch.
- [SCALABILITY.md](./SCALABILITY.md) describes the path toward high-concurrency readiness.
- See [AUDIT.md](./AUDIT.md) for the latest code audit and [CHANGELOG.md](./CHANGELOG.md)
  for notable changes.

## Docs MCP (AI clients)

Kuppi runs a remote MCP server at `/api/mcp`. Any AI (Claude Desktop, Codex,
Cursor, …) can browse auto-generated hashtags, search the library, read
extracted note text in-chat, share permalinks — and publish notes with a
login. Reads are public; uploads are login-gated like every other upload path.

See [docs/mcp.md](./docs/mcp.md) for client config, the tool list, and plain
REST mirrors under `/api/v1/*`.
