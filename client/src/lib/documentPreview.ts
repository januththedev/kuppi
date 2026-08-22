export type DocumentPreviewMode = "document" | "image" | "video" | "audio" | "download";

export function documentPreviewMode(mimeType: string): DocumentPreviewMode {
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) return "document";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "download";
}
