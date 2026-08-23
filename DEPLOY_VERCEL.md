# Deploying Kuppi to Vercel

Kuppi is a full-stack app (Express + tRPC + MySQL), not a static site. The repo is
already wired for Vercel:

- `api/index.ts` — serverless entry that runs the same Express app as `pnpm start`
- `vercel.json` — builds the SPA into `dist/public`, routes `/api/*` (and legacy
  `/manus-storage/*`) to the function, and falls back to `index.html` for SPA routes
- `server/storage.ts` — picks a storage mode automatically, first match wins:
  **S3/MinIO** (`S3_*` vars — our Oracle Always-Free VM) → **Vercel Blob**
  (`BLOB_READ_WRITE_TOKEN`) → local disk. In both remote modes files stream
  **directly from the browser** (up to 30 MB): S3 via presigned PUT,
  Blob via its authenticated token route

## What you must provide

| Setting | Where | Value |
|---|---|---|
| **MySQL database** | any external provider | Vercel does not include databases. Create one and copy its connection string. MySQL options: [Aiven](https://aiven.io) (free tier), [Railway](https://railway.app), [PlanetScale](https://planetscale.com). Postgres will **not** work — the schema is MySQL. |
| `DATABASE_URL` | Vercel → Project → Settings → Environment Variables | `mysql://user:password@host:3306/dbname` (add `?ssl={"rejectUnauthorized":true}` style params if your provider requires SSL config) |
| `JWT_SECRET` | Vercel env vars | any long random string (`openssl rand -base64 48`) |
| `BLOB_READ_WRITE_TOKEN` *(legacy fallback)* | Vercel env vars | Storage tab → create a Blob store → connect it (injects the token). Keep during the MinIO migration; remove once `ops/migrate-vercel-blob.mjs` has repointed every row |
| `S3_ENDPOINT` + `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` | Vercel env vars | **Target mode.** MinIO on our Oracle Always-Free VM — values come from `/root/kuppi-s3-credentials.env` after provisioning (`ops/README.md`). Also set `S3_BUCKET=kuppi-uploads` and `S3_REGION=us-east-1` |
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

- **Upload size — solved for large files:** in S3/MinIO or Blob mode the upload
  form streams files **directly from the browser to object storage** with a
  live progress bar, so the full **30 MB** limit works on Vercel. The old
  base64-through-API path only remains as fallback for self-hosted single-server
  deploys.
- **Image OCR quizzes:** tesseract.js OCR may be slow or fail inside serverless
  functions; PDF-based quizzes are unaffected.
- **Cold starts:** the first request after inactivity takes a few seconds.

If you outgrow those constraints, the same repo runs unchanged as a always-on Node
server (`pnpm build && pnpm start`) on Railway / Render / Fly.io / any VPS, where
local-disk storage mode also works as-is.

## Storage: Vercel Blob → MinIO cutover (current state)

Kuppi is moving off Vercel Blob to MinIO on an Oracle Cloud Always-Free ARM VM
(200 GB free). Full runbook with provisioning scripts: **[ops/README.md](ops/README.md)**.

1. Provision the VM (Path A via OCI CLI, or Path B console + IP handoff).
2. Put the printed `S3_*` values into Vercel env vars and redeploy — new uploads
   land in MinIO; `storage.mode` reports `s3`.
3. Migrate history once: `node ops/migrate-vercel-blob.mjs` (idempotent,
   keeps Blob originals until you remove `BLOB_READ_WRITE_TOKEN`).

## Local production check before deploying

```bash
pnpm build && NODE_ENV=production PORT=3200 node dist/index.js
# → http://localhost:3200
```
