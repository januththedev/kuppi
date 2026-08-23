// Kuppi storage layer.
//
// Three interchangeable modes, chosen automatically from the environment:
//  1. Manus Forge mode (BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY set):
//     uploads are presigned to S3 and downloads go through /manus-storage/{key}.
//  2. Vercel Blob mode (BLOB_READ_WRITE_TOKEN set, no Forge credentials):
//     uploads go to a Vercel Blob store and are served from its public CDN.
//     This is the mode to use on Vercel, where serverless disks are ephemeral.
//  3. Self-hosted mode (neither configured): files live on local disk under
//     KUPPI_STORAGE_DIR (default ./storage-data) and are served by the app at
//     /api/storage-files/{key}.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./_core/env";

const LOCAL_STORAGE_ROOT = process.env.KUPPI_STORAGE_DIR
  ? path.resolve(process.env.KUPPI_STORAGE_DIR)
  : path.resolve(process.cwd(), "storage-data");

function forgeConfigured(): boolean {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}

export function useVercelBlobStorage(): boolean {
  return !forgeConfigured() && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function useLocalStorageSync(): boolean {
  return !forgeConfigured() && !useVercelBlobStorage();
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
