// Kuppi storage layer.
//
// Four interchangeable modes, chosen automatically from the environment
// (first configured wins):
//  1. Manus Forge mode (BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY set):
//     uploads are presigned to S3 and downloads go through /manus-storage/{key}.
//  2. S3/MinIO mode (S3_ENDPOINT + access keys set): uploads are presigned
//     straight from the browser to a self-hosted MinIO server and served from
//     its public base URL. See server/s3Storage.ts and ops/README.md.
//  3. Vercel Blob mode (BLOB_READ_WRITE_TOKEN set, no S3/Forge credentials):
//     uploads go to a Vercel Blob store and are served from its public CDN.
//     This is the legacy Vercel mode, kept as a fallback during migration.
//  4. Self-hosted mode (neither configured): files live on local disk under
//     KUPPI_STORAGE_DIR (default ./storage-data) and are served by the app at
//     /api/storage-files/{key}.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./_core/env";
import { s3PresignedGet, s3PutObject } from "./s3Storage";

const LOCAL_STORAGE_ROOT = process.env.KUPPI_STORAGE_DIR
  ? path.resolve(process.env.KUPPI_STORAGE_DIR)
  : path.resolve(process.cwd(), "storage-data");

function forgeConfigured(): boolean {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}

export function useVercelBlobStorage(): boolean {
  return !forgeConfigured() && !useS3Storage() && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Leaf predicate reading env directly so mode selection stays recursion-free. */
function s3EnvConfigured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT?.trim() &&
      process.env.S3_ACCESS_KEY_ID?.trim() &&
      process.env.S3_SECRET_ACCESS_KEY?.trim(),
  );
}

export function storageMode(): "forge" | "s3" | "blob" | "local" {
  if (forgeConfigured()) return "forge";
  if (s3EnvConfigured()) return "s3";
  if (Boolean(process.env.BLOB_READ_WRITE_TOKEN)) return "blob";
  return "local";
}

export function useS3Storage(): boolean {
  return storageMode() === "s3";
}

export function useLocalStorageSync(): boolean {
  return storageMode() === "local";
}

/**
 * Derive an object key from a stored resource URL.
 * Path-style S3 URLs carry the bucket as their first path segment
 * (<endpoint>/<bucket>/<key>), which must be stripped to recover the key;
 * virtual-host URLs and Vercel Blob URLs already start at the key.
 */
export function storageKeyFromUrl(rawUrl: string): string | null {
  if (!/^https?:\/\//i.test(rawUrl)) {
    if (!rawUrl.startsWith("/")) return null;
    return safeDecode(rawUrl.slice(1));
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const bucket = process.env.S3_BUCKET?.trim() || "kuppi-uploads";
  let candidate: string;
  try {
    candidate = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  } catch {
    candidate = parsed.pathname.replace(/^\/+/, "");
  }
  if (candidate.startsWith(`${bucket}/`)) return candidate.slice(bucket.length + 1);
  return candidate || safeDecode(parsed.pathname.replace(/^\/+/, "")) || rawUrl;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveLocalPath(relKey: string): string {
  const normalized = relKey.replace(/^\/+/, "");
  const resolved = path.resolve(LOCAL_STORAGE_ROOT, normalized);
  // Path traversal guard: never serve anything outside the storage root.
  if (resolved !== LOCAL_STORAGE_ROOT && !resolved.startsWith(LOCAL_STORAGE_ROOT + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

async function storagePutLocal(
  relKey: string,
  data: Buffer | Uint8Array | string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const target = resolveLocalPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return { key, url: `/api/storage-files/${key}` };
}

async function storagePutBlob(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const { put } = await import("@vercel/blob");
  const key = normalizeKey(relKey);
  // Deterministic suffix-free URL so storageGetSignedUrl can reconstruct the
  // public URL from the key alone; safeStorageName already embeds a UUID.
  // PutBody accepts string | Buffer (not plain Uint8Array), so normalize.
  const body = typeof data === "string" ? data : Buffer.from(data);
  const blob = await put(key, body, {
    access: "public",
    addRandomSuffix: false,
    contentType,
  });
  return { key, url: blob.url };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  if (useLocalStorageSync()) {
    return storagePutLocal(relKey, data);
  }
  if (useS3Storage()) {
    return s3PutObject(normalizeKey(relKey), data, contentType);
  }
  if (useVercelBlobStorage()) {
    return storagePutBlob(relKey, data, contentType);
  }

  const forgeUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;
  const key = appendHashSuffix(normalizeKey(relKey));

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as BlobPart], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (useLocalStorageSync()) return { key, url: `/api/storage-files/${key}` };
  if (useVercelBlobStorage()) return { key, url: await storageGetSignedUrl(key) };
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  if (useLocalStorageSync()) {
    // Local mode reads straight from disk via storageReadBuffer; this URL is
    // only used as a browser-facing fallback.
    return `/api/storage-files/${key}`;
  }
  if (useS3Storage()) {
    // Presigned GET works whether or not the bucket stays public-read.
    return s3PresignedGet(key);
  }
  if (useVercelBlobStorage()) {
    // Blob objects live at a deterministic public URL for this key.
    const { head } = await import("@vercel/blob");
    try {
      const meta = await head(key);
      return meta.url;
    } catch {
      throw new Error("Kuppi could not find this uploaded resource in blob storage.");
    }
  }

  const getUrl = new URL(
    "v1/storage/presign/get",
    ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
  );
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}

/** Read an object's bytes directly. Used by text extraction in self-hosted mode. */
export async function storageReadBuffer(relKey: string): Promise<Buffer> {
  return readFile(resolveLocalPath(normalizeKey(relKey)));
}
