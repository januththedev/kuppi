# Deploying Kuppi to Vercel

Kuppi is a full-stack app (Express + tRPC + MySQL), not a static site. The repo is
already wired for Vercel:

- `api/index.ts` — serverless entry that runs the same Express app as `pnpm start`
- `vercel.json` — builds the SPA into `dist/public`, routes `/api/*` (and legacy
  `/manus-storage/*`) to the function, and falls back to `index.html` for SPA routes
- `server/storage.ts` + `server/blobUploadRoute.ts` — automatically uses **Vercel
  Blob** for uploads when `BLOB_READ_WRITE_TOKEN` is set; files stream **directly
  from the browser to Blob** (up to 30 MB) via an authenticated token route, since
  serverless disks are ephemeral and request bodies are size-capped

## What you must provide

| Setting | Where | Value |
|---|---|---|
| **MySQL database** | any external provider | Vercel does not include databases. Create one and copy its connection string. MySQL options: [Aiven](https://aiven.io) (free tier), [Railway](https://railway.app), [PlanetScale](https://planetscale.com). Postgres will **not** work — the schema is MySQL. |
| `DATABASE_URL` | Vercel → Project → Settings → Environment Variables | `mysql://user:password@host:3306/dbname` (add `?ssl={"rejectUnauthorized":true}` style params if your provider requires SSL config) |
| `JWT_SECRET` | Vercel env vars | any long random string (`openssl rand -base64 48`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel env vars | Storage tab → create a Blob store → connect it to the project (Vercel injects the token) |
| `OPENROUTER_API_KEY` *(optional)* | Vercel env vars | enables AI MCQ quizzes; everything else works without it |

## Steps

1. Push this branch/repo to GitHub.
2. In Vercel: **Add New Project → Import** the repo (framework preset "Other" is fine;
   `vercel.json` supplies build command `pnpm build` and output dir `dist/public`).
3. Create a Blob store (Storage tab) and connect it — this sets `BLOB_READ_WRITE_TOKEN`.
4. Add `DATABASE_URL` and `JWT_SECRET` (and optionally `OPENROUTER_API_KEY`) under
   Settings → Environment Variables.
5. Create the database tables once, from your machine, against the cloud database:
   ```bash
   DATABASE_URL="<your cloud mysql url>" pnpm db:push
   ```
6. Deploy. Sign-up, uploads, comments, likes/saves, dashboard, moderation, and AI
   quizzes all run inside the serverless function.

## Honest limits on Vercel

- **Upload size — solved for large files:** when `BLOB_READ_WRITE_TOKEN` is set
  (Blob store connected), the upload form streams files **directly from the
  browser to Vercel Blob** with a live progress bar, so the full **30 MB** limit
  works on Vercel. The old base64-through-API path only remains as fallback for
  self-hosted single-server deploys.
- **Image OCR quizzes:** tesseract.js OCR may be slow or fail inside serverless
  functions; PDF-based quizzes are unaffected.
- **Cold starts:** the first request after inactivity takes a few seconds.

If you outgrow those constraints, the same repo runs unchanged as a always-on Node
server (`pnpm build && pnpm start`) on Railway / Render / Fly.io / any VPS, where
local-disk storage mode also works as-is.

## Local production check before deploying

```bash
pnpm build && NODE_ENV=production PORT=3200 node dist/index.js
# → http://localhost:3200
```
