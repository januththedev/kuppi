// Kuppi storage layer.
//
// Two interchangeable modes:
//  - Manus Forge mode (default when BUILT_IN_FORGE_API_URL/KEY are set):
//    uploads are presigned to S3 and downloads go through /manus-storage/{key}.
//  - Self-hosted mode (no Forge credentials): files live on local disk under
//    KUPPI_STORAGE_DIR (default ./storage-data) and are served by the app at
//    /api/storage-files/{key}. This keeps uploads working without any
//    platform-specific service.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./_core/env";

const LOCAL_STORAGE_ROOT = process.env.KUPPI_STORAGE_DIR
  ? path.resolve(process.env.KUPPI_STORAGE_DIR)
  : path.resolve(process.cwd(), "storage-data");

export function useLocalStorageSync(): boolean {
  return !ENV.forgeApiUrl || !ENV.forgeApiKey;
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

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  if (useLocalStorageSync()) {
    return storagePutLocal(relKey, data);
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
  return {
    key,
    url: useLocalStorageSync() ? `/api/storage-files/${key}` : `/manus-storage/${key}`,
  };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  if (useLocalStorageSync()) {
    // Local mode reads straight from disk via storageReadBuffer; this URL is
    // only used as a browser-facing fallback.
    return `/api/storage-files/${normalizeKey(relKey)}`;
  }

  const getUrl = new URL(
    "v1/storage/presign/get",
    ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
  );
  getUrl.searchParams.set("path", normalizeKey(relKey));

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
