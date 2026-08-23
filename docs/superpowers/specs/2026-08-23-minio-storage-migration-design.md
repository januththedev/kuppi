# Design: Migrate Kuppi storage from Vercel Blob to Oracle Cloud Always-Free VM + MinIO

Date: 2026-08-23
Status: Approved-by-directive (autonomous session goal; Januth pre-authorized autonomous runs)

## Problem

Kuppi stores uploaded study resources (up to 30 MB, streamed browser→storage) on **Vercel Blob**, which bills per GB stored/bandwidth and locks the data inside Vercel. Goal: move to a **self-hosted, S3-compatible MinIO server on an Oracle Cloud Always-Free ARM VM** (4 OCPU / 24 GB RAM / 200 GB block volume free tier), controlled directly from this dev machine.

## Current state (verified)

- `server/storage.ts` already abstracts three modes — `forge` / `blob` / `local` — behind `storagePut`, `storageGet`, `storageGetSignedUrl`, `storageReadBuffer`, selected by env predicates.
- Exactly 4 code touchpoints of `@vercel/blob`: `storage.ts:70` (`put`), `storage.ts:151` (`head`), `server/blobUploadRoute.ts:24` (`handleUpload` token issuer for `POST /api/blob-upload`), `client/src/pages/Home.tsx:159` (browser-side `upload()`).
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner@^3.693.0` are **already dependencies, imported nowhere** — free to adopt.
- `resources` table persists `storageKey` + `storageUrl`; several lookups exact-match `storageUrl`. Existing rows keep working because lookups are by URL string; mixed-URL history (old Blob rows + new MinIO rows) is expected and acceptable.
- No OCI account/CLI exists on this machine yet — VM creation requires Januth's one-time signup (credit card + OTP). Everything else is automatable.

## Target architecture

```
Browser (Home.tsx)                         Oracle Always-Free ARM VM (Ubuntu)
  │ 1. tRPC resource.uploadUrl                ┌──────────────────────────────┐
  ├──────────────────────────────────────────▶│  Kuppi API (Vercel serverless)│◀── presign (SigV4)
  │ 2. XHR PUT file ── presigned URL ─────────────────▶ MinIO (arm64, :9000) │
  │ 3. tRPC resource.createMeta(storageUrl)             ▲   behind Caddy TLS │
  │    persist public URL                               │ :443 auto-HTTPS     │
  ▼                                                     │                     │
DB (MySQL/Aiven) stores storageUrl = https://<minio-domain>/<bucket>/<key>    │
Server reads (quiz text extraction) use presigned GET (SigV4, short expiry)  │
```

## Decisions

1. **Fourth storage mode `"s3"`** in `server/storage.ts`. Precedence stays: forge → **s3** → blob → local. Setting `S3_ENDPOINT` + keys flips production off Vercel Blob without deleting the Blob fallback until migration completes.
   - Env: `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` (default `kuppi-uploads`), `S3_REGION` (default `us-east-1`, MinIO's default), `S3_PUBLIC_BASE_URL` (optional override for the browser-facing base, e.g. a TLS domain differing from the signing endpoint), `S3_FORCE_PATH_STYLE` (default true).
2. **Public-read bucket** (parity with today's `access: "public"` Vercel Blob semantics): `storageUrl` values stay plain, permanent, renderable URLs — required because `DocumentPreview`, Dashboard links, and DB lookups consume raw URLs directly. Private-bucket hardening is explicitly out of scope.
3. **Direct uploads via presigned PUT**: extend tRPC `resource.uploadUrl` to return a discriminated result `{ driver: "vercel-blob", pathname } | { driver: "s3", key, uploadUrl, publicUrl, headers }`. Client branches on `driver`; XHR PUT keeps progress reporting. Auth + 30 MB cap enforced server-side before presigning; expiry 15 minutes.
4. **Path-style addressing** (`https://host/bucket/key`). Consequence: `createMeta`'s current key derivation (`pathname.slice(1)`) would include the bucket prefix — fixed by a shared `storageKeyFromUrl()` helper in `storage.ts` that strips `/<bucket>/` (and copes with virtual-host style). Old Blob URLs pass through unchanged.
5. **Server reads** (`resourceTextExtraction`) use presigned GET (1 h expiry) — works regardless of bucket policy drift.
6. **VM provisioning is fully scripted but gated on Januth's one-time signup.** Two paths documented in `ops/README.md`: (A) Januth provides OCI API keys → `ops/provision-oci.sh` drives `oci` CLI end-to-end (A1.Flex instance + cloud-init + DNS-less sslip.io TLS); (B) Januth clicks through console once → hands over VM IP → SSH provisioning scripts finish everything.
7. **TLS via Caddy on the VM** (Let's Encrypt). Browsers on the HTTPS site cannot PUT to `http://<ip>:9000` (mixed content), so TLS is mandatory, not optional. Domain strategy: a dedicated subdomain (preferred) or `<ip>.sslip.io` automatic cert.
8. **CORS**: MinIO runs with `MINIO_API_CORS_ALLOW_ORIGIN=*` (uploads are authenticated-presigned anyway; parity with Blob's cross-origin CDN).

## Components

| Component | Change |
|---|---|
| `server/storage.ts` | Add `useS3Storage()`, lazy S3 client factory, `storagePutS3`, presigned GET in `storageGetSignedUrl`, `storageKeyFromUrl()`, mode export |
| `server/routers.ts` | `storage.mode` returns `"s3"`; `uploadUrl` becomes dual-driver; `createMeta` derives key via helper |
| `client/src/pages/Home.tsx` | Branch on `driver === "s3"`: XHR PUT with progress → `createMeta(publicUrl)` |
| `ops/*` | `vm-bootstrap.sh` (idempotent MinIO+Caddy+mc setup, arm64), `cloud-init.yaml`, `provision-oci.sh` (OCI CLI path), `provision-from-local.sh` (SSH path), `smoke-test.mjs`, `migrate-vercel-blob.mjs`, `dev-minio.sh`, README runbook |
| Tests | Vitest unit tests (key derivation, mode precedence); `scripts/e2e-s3.mjs` live round-trip vs Docker MinIO incl. presigned PUT + CORS-shaped request |

## Error handling

- Presign failures surface as tRPC errors with actionable messages (same UX as Blob mode today).
- Upload XHR failure → toast + retry, identical to current catch path.
- Migration script is idempotent: skips objects already present with matching size; dry-run flag; never deletes Blob originals (rollback = unset S3 env vars).

## Testing

1. Vitest units for `storageKeyFromUrl` (path-style, virtual-host, Blob URL, root-relative) and mode-precedence predicates.
2. `scripts/e2e-s3.mjs` against Docker MinIO on localhost:9000: boot server with S3 env → register → uploadTarget/presigned PUT → createMeta → public GET → quiz-extraction presigned GET. Exit code gates completion.
3. Smoke-test script reused post-provisioning against the real VM.

## Out of scope

- Deleting the Vercel Blob dependency/code (kept as fallback mode until cutover is confirmed).
- Private buckets / signed browser reads, CDN in front of MinIO, backups/replication, multi-node MinIO.
