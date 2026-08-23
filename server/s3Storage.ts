// S3-compatible object storage (MinIO on an Oracle Always-Free VM, or any
// S3 endpoint) behind Kuppi's storage abstraction.
//
// Configuration comes entirely from the environment so deployments can point
// at a local MinIO in dev and the production VM in prod:
//   S3_ENDPOINT           e.g. http://localhost:9000 or https://minio.example.com
//   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
//   S3_BUCKET             default kuppi-uploads
//   S3_REGION             default us-east-1 (MinIO's default)
//   S3_PUBLIC_BASE_URL    optional browser-facing base (defaults to <endpoint>/<bucket>)
//   S3_FORCE_PATH_STYLE   default true (path-style: <endpoint>/<bucket>/<key>)

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
}

export function readS3Config(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  const bucket = process.env.S3_BUCKET?.trim() || "kuppi-uploads";
  const region = process.env.S3_REGION?.trim() || "us-east-1";
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== "false";
  const publicBaseUrl = (
    process.env.S3_PUBLIC_BASE_URL?.trim() ||
    `${endpoint.replace(/\/+$/, "")}/${bucket}`
  ).replace(/\/+$/, "");

  return { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle, publicBaseUrl };
}

export function s3Configured(): boolean {
  return readS3Config() !== null;
}

let cachedClient: S3Client | null = null;

/** Lazy singleton; rebuilt only in tests that clear the cache via config change. */
export function getS3Client(): S3Client {
  const cfg = readS3Config();
  if (!cfg) throw new Error("S3 storage is not configured.");
  if (!cachedClient) {
    cachedClient = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  return cachedClient;
}

function stripLeadingSlashes(key: string): string {
  return key.replace(/^\/+/, "");
}

export function s3PublicUrl(cfg: S3Config, key: string): string {
  return `${cfg.publicBaseUrl}/${stripLeadingSlashes(key)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export async function s3PutObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const cfg = readS3Config();
  if (!cfg) throw new Error("S3 storage is not configured.");
  const normalized = stripLeadingSlashes(key);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: normalized,
      Body: typeof body === "string" ? body : new Uint8Array(body),
      ContentType: contentType,
    }),
  );
  return { key: normalized, url: s3PublicUrl(cfg, normalized) };
}

const PRESIGN_UPLOAD_SECONDS = 15 * 60;
const PRESIGN_READ_SECONDS = 60 * 60;

export async function s3PresignedPut(
  key: string,
  contentType: string,
  expiresInSec = PRESIGN_UPLOAD_SECONDS,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const cfg = readS3Config();
  if (!cfg) throw new Error("S3 storage is not configured.");
  const normalized = stripLeadingSlashes(key);
  const uploadUrl = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({ Bucket: cfg.bucket, Key: normalized, ContentType: contentType }),
    { expiresIn: expiresInSec },
  );
  return { uploadUrl, publicUrl: s3PublicUrl(cfg, normalized) };
}

export async function s3PresignedGet(key: string, expiresInSec = PRESIGN_READ_SECONDS): Promise<string> {
  const cfg = readS3Config();
  if (!cfg) throw new Error("S3 storage is not configured.");
  return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: cfg.bucket, Key: stripLeadingSlashes(key) }), {
    expiresIn: expiresInSec,
  });
}
