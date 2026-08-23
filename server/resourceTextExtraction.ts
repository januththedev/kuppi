import { storageGetSignedUrl, storageReadBuffer, useLocalStorageSync } from "./storage";

export function prepareQuizSource(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 12000);
}

export function hasEnoughQuizSource(text: string) {
  return text.length >= 120;
}

async function fetchResourceBuffer(storageKey: string) {
  // Self-hosted mode reads the file straight from disk; Forge mode goes
  // through a presigned URL.
  if (useLocalStorageSync()) {
    return storageReadBuffer(storageKey);
  }
  const signedUrl = await storageGetSignedUrl(storageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("Kuppi could not read this uploaded resource.");
  return Buffer.from(await response.arrayBuffer());
}

export async function extractResourceText(resource: { storageKey: string; mimeType: string }) {
  const buffer = await fetchResourceBuffer(resource.storageKey);
  if (resource.mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return prepareQuizSource(result.text);
  }
  if (resource.mimeType.startsWith("image/")) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const result = await worker.recognize(buffer);
    await worker.terminate();
    return prepareQuizSource(result.data.text);
  }
  throw new Error("Text extraction is available for PDF and image resources only.");
}
