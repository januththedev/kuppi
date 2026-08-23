# MinIO Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Kuppi's object storage from Vercel Blob to self-hosted MinIO on an Oracle Always-Free ARM VM, behind the existing storage abstraction, fully scripted except Januth's one-time OCI signup.

**Architecture:** New `"s3"` storage mode (precedence forge → s3 → blob → local) using the already-installed `@aws-sdk/client-s3` + presigner. Browser streams files via presigned PUT straight to MinIO (parity with today's direct-to-Blob flow); persisted `storageUrl`s are permanent public-read URLs (path-style, bucket prefix stripped by a shared key-derivation helper). An `ops/` toolkit provisions the VM (cloud-init or SSH), installs MinIO+Caddy TLS, smoke-tests, and migrates existing Blob objects idempotently.

**Tech Stack:** TypeScript/Express/tRPC (existing), `@aws-sdk/client-s3@^3.693.0`, `@aws-sdk/s3-request-presigner`, MinIO (linux-arm64), Caddy (auto-HTTPS), Docker (local MinIO), Vitest, mysql2 (migration).

## Global Constraints

- Max upload stays 30 MB (`MAX_UPLOAD_BYTES`, `server/resourceSafety.ts`) — never relax server or client checks.
- Existing DB rows keep their `*.vercel-storage.com` URLs and must remain resolvable until migration; migration never deletes Blob originals.
- Local commits only; conventional-commit messages matching repo history (`feat:`, `fix:`, `docs:`, `ops:` acceptable style).
- Windows Git Bash is the operator shell for `ops/*.sh`; VM target is Ubuntu arm64.
- MinIO binds `127.0.0.1:9000` on the VM (Caddy terminates TLS on 443); local dev MinIO exposes 9000 directly.
- Public URLs are path-style: `<publicBase>/<key>` where `publicBase` defaults to `<endpoint>/<bucket>`.
- All new env vars: `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` (default `kuppi-uploads`), `S3_REGION` (default `us-east-1`), `S3_PUBLIC_BASE_URL` (optional), `S3_FORCE_PATH_STYLE` (default true).

---

### Task 1: S3 storage core (`server/s3Storage.ts` + wiring into `server/storage.ts`)

**Files:**
- Create: `server/s3Storage.ts`
- Modify: `server/storage.ts`
- Test: `server/storage.test.ts` (new)

**Interfaces (produced):**
```ts
// server/s3Storage.ts
export interface S3Config { endpoint: string; region: string; bucket: string;
  accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean; publicBaseUrl: string; }
export function readS3Config(): S3Config | null          // null unless ENDPOINT+KEYS set
export function s3Configured(): boolean                   // Boolean(readS3Config())
export function getS3Client(): S3Client                   // lazy memoized singleton
export function s3PublicUrl(cfg: S3Config, key: string): string
export async function s3PutObject(key: string, body: Buffer|Uint8Array|string, contentType: string): Promise<{key,url}>
export async function s3PresignedPut(key: string, contentType: string, expiresInSec?: number): Promise<{uploadUrl, publicUrl}>
export async function s3PresignedGet(key: string, expiresInSec?: number): Promise<string>
// server/storage.ts
export type StorageMode = "forge" | "s3" | "blob" | "local"
export function storageMode(): StorageMode                // forge→s3→blob→local precedence
export function storageKeyFromUrl(rawUrl: string): string | null
```

Key logic:
- `readS3Config()` reads `process.env.S3_*` live (testable without module reset); `forcePathStyle` defaults true; `publicBaseUrl = S3_PUBLIC_BASE_URL ?? stripTrailingSlash(endpoint)+"/"+bucket`.
- `storageKeyFromUrl`: non-http(s) → root-relative `/x` decodes to `x`, else null. Parse URL; decoded pathname minus leading slash = candidate; if candidate startsWith `"<bucket>/"` strip it; if hostname startsWith `"<bucket>."` keep as-is (virtual-host); decode defensively (try/catch → raw).
- `storage.ts`: `useLocalStorageSync()` becomes `storageMode()==="local"` equivalent — keep exported predicates working (`useVercelBlobStorage` unchanged; add `useS3Storage(){ return storageMode()==="s3" }`). `storagePut` gains s3 branch calling `s3PutObject(normalizeKey(relKey),…)`; `storageGetSignedUrl` s3 branch returns `s3PresignedGet(key, 3600)`.

- [ ] Write failing unit tests (`storageKeyFromUrl` path-style/virtual-host/blob-url/root-relative/malformed; `storageMode` precedence with env stubbing incl. S3-beats-Blob)
- [ ] Run `pnpm vitest run server/storage.test.ts` → fail
- [ ] Implement s3Storage.ts + storage.ts branches
- [ ] Tests green; commit `feat: S3-compatible storage mode behind existing abstraction`

### Task 2: Dual-driver direct upload (server)

**Files:**
- Modify: `server/routers.ts` (`storage.mode`, `resource.uploadUrl`, `resource.createMeta`)
- Test: covered by Task 4 e2e + Task 1 units

**Interfaces:** `uploadUrl` returns `{ driver:"vercel-blob", pathname } | { driver:"s3", key, uploadUrl, publicUrl, headers:{ "Content-Type": string } }`. Order: size check first (30 MB, PAYLOAD_TOO_LARGE), then `driver = storageMode(); blob→{pathname}; s3→presign(15 min); else BAD_REQUEST`. `createMeta` derives key via `storageKeyFromUrl(storageUrl) ?? storageUrl`.

- [ ] Implement router changes
- [ ] `pnpm build` typechecks (tsc step) ; commit `feat: dual-driver direct uploads (Vercel Blob | S3 presigned PUT)`

### Task 3: Client switch (`client/src/pages/Home.tsx`)

**Files:**
- Modify: `client/src/pages/Home.tsx:152-174` (`submitUpload`)

Branch when `storageModeQuery.data?.mode === "blob" || === "s3"`; if eligibility `driver === "s3"`: XHR PUT to `eligibility.uploadUrl`, `Content-Type` header from `eligibility.headers["Content-Type"]`, progress via `xhr.upload.onprogress`, then `createMetaMutation.mutate({ …meta, storageUrl: eligibility.publicUrl, fileSize: file.size })`. Blob branch unchanged.

- [ ] Implement; `pnpm build` green; commit `feat: browser-direct S3 uploads with progress`

### Task 4: Live verification (Docker MinIO end-to-end)

**Files:**
- Create: `scripts/e2e-s3.mjs`
- Recreate local container with `-e MINIO_API_CORS_ALLOW_ORIGIN="*"`

Script: spawns server (`PORT=3210 NODE_ENV=production S3_ENDPOINT=http://localhost:9000 S3_BUCKET=kuppi-uploads S3_ACCESS_KEY_ID=kuppi-admin S3_SECRET_ACCESS_KEY=kuppi-local-secret`), waits `/api/health`, registers a student via the tRPC HTTP wire format (match client's link/transformer — verify in `client/src` trpc setup first), exercises: storage.mode=`s3` → uploadUrl → PUT bytes to presigned URL → createMeta(publicUrl) → resource.list shows row → fetch(publicUrl) round-trips bytes → dashboard.mine ok. Prints PASS/FAIL lines, exits non-zero on failure.

- [ ] e2e green locally; commit `test: end-to-end S3 upload flow against local MinIO`

### Task 5: Ops framework (`ops/`)

**Files (all new):**
- `ops/dev-minio.sh` — recreate local MinIO w/ CORS env + bucket + public-read (idempotent)
- `ops/vm-bootstrap.sh` — idempotent on-VM setup: minio.deb (arm64) + `/etc/default/minio` (`MINIO_VOLUMES=/opt/minio/data`, bind 127.0.0.1:9000, CORS `*`), mc + bucket `kuppi-uploads` public-read, dedicated app user `kuppi-app` + scoped policy (keys → `/root/kuppi-s3-credentials.env`, chmod 600), iptables ACCEPT 80/443 (idempotent `-C||-I`, persist via netfilter-persistent if present), Caddy via cloudsmith apt repo + Caddyfile `reverse_proxy 127.0.0.1:9000` for `${MINIO_DOMAIN}` or `<public-ip>.sslip.io`, enable+verify services, print summary
- `ops/cloud-init.yaml` — template: write_files bootstrap.sh + runcmd; provisioner injects `vm-bootstrap.sh`
- `ops/provision-oci.sh` — OCI CLI path: verify cli/config, ensure SSH keypair `~/.ssh/kuppi_oci`, resolve Canonical Ubuntu arm64 image OCID, launch `VM.Standard.A1.Flex` (ocpu 4, mem 24, boot volume 200 GB, subnet required args), user_data = embedded bootstrap, capacity-retry loop, fetch public IP, print next steps
- `ops/provision-from-local.sh HOST [USER]` — scp bootstrap → ssh run → local smoke test
- `ops/smoke-test.mjs` — env-driven: PutObject/public GET/presigned GET/Head/Delete assertions
- `ops/migrate-vercel-blob.mjs` — mysql2: select rows w/ vercel-storage URLs → fetch bytes → PutObject same key (skip if HeadObject size matches) → UPDATE storage_url; flags `--dry-run/--limit/--concurrency`; summary; never deletes
- `ops/README.md` — runbook: manual OCI signup steps (exact console clicks), Path A (give agent OCI API key → `provision-oci.sh`), Path B (manual instance → give IP → `provision-from-local.sh`), cutover env vars for Vercel, migration command, rollback (unset S3 vars)

- [ ] Shellcheck-clean-ish, executable bits set; commit `ops: Oracle Always-Free VM provisioning toolkit + Blob migration script`

### Task 6: Docs + env plumbing

**Files:** `.env.example` (S3 block + precedence comment), `DEPLOY_VERCEL.md` (cutover section)

- [ ] Commit `docs: S3/MinIO configuration and Vercel cutover guide`

### Task 7: Completion audit

- [ ] Full `pnpm build` + `pnpm vitest run` + e2e rerun from clean tree
- [ ] Verify every spec decision (design doc §Decisions 1–8) maps to shipped code/script/docs
