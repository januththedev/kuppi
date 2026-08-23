import { randomUUID } from "node:crypto";

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const MAX_BASE64_LENGTH = Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 8;

export function validateResourceUpload(input: { originalFileName: string; base64Length: number; byteLength: number }) {
  if (!input.originalFileName.trim()) return "A file name is required.";
  if (!input.byteLength) return "The selected file is empty.";
  if (input.byteLength > MAX_UPLOAD_BYTES || input.base64Length > MAX_BASE64_LENGTH) return "Files must be 25 MB or smaller.";
  return null;
}

export function safeStorageName(fileName: string) {
  const base = fileName.split(/[\\/]/).pop() || "resource";
  const stem = base.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "resource";
  const extension = base.includes(".") ? `.${base.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}` : "";
  return `${stem}-${randomUUID()}${extension}`;
}
