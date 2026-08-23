import { afterEach, describe, expect, it } from "vitest";
import { storageKeyFromUrl } from "./storage";

// storageKeyFromUrl is a pure function; the S3 bucket default only matters
// when a URL carries the bucket as its first path segment.
const BUCKET_ENV = { S3_BUCKET: "kuppi-uploads" };

function withEnv<T>(vars: Record<string, string>, run: () => T): Promise<T> | T {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === "") delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  return Promise.resolve()
    .then(run)
    .finally(restore);
}

describe("storageKeyFromUrl", () => {
  it("derives the key from a path-style S3 URL by stripping the bucket prefix", () => {
    withEnv(BUCKET_ENV, () => {
      expect(storageKeyFromUrl("https://minio.example.com/kuppi-uploads/kuppi/u1/resources/notes.pdf")).toBe(
        "kuppi/u1/resources/notes.pdf",
      );
    });
  });

  it("keeps the full path for virtual-host style S3 URLs", () => {
    withEnv(BUCKET_ENV, () => {
      expect(storageKeyFromUrl("https://kuppi-uploads.minio.example.com/kuppi/u1/resources/notes.pdf")).toBe(
        "kuppi/u1/resources/notes.pdf",
      );
    });
  });

  it("passes Vercel Blob URLs through as their pathname", () => {
    withEnv(BUCKET_ENV, () => {
      expect(storageKeyFromUrl("https://abc123.public.blob.vercel-storage.com/kuppi/u1/resources/old.pdf")).toBe(
        "kuppi/u1/resources/old.pdf",
      );
    });
  });

  it("decodes percent-encoded object keys", () => {
    withEnv(BUCKET_ENV, () => {
      expect(storageKeyFromUrl("https://minio.example.com/kuppi-uploads/kuppi/u1/resources/my%20notes.pdf")).toBe(
        "kuppi/u1/resources/my notes.pdf",
      );
    });
  });

  it("maps root-relative URLs to their path", () => {
    expect(storageKeyFromUrl("/api/storage-files/kuppi/u1/notes.pdf")).toBe("api/storage-files/kuppi/u1/notes.pdf");
  });

  it("returns null for non-http schemes and unparseable input", () => {
    expect(storageKeyFromUrl("javascript:alert(1)")).toBeNull();
    expect(storageKeyFromUrl("not a url %%%")).toBeNull();
  });

  it("survives malformed percent-encoding inside an otherwise valid URL", () => {
    withEnv(BUCKET_ENV, () => {
      expect(storageKeyFromUrl("https://minio.example.com/kuppi-uploads/kuppi/u1/%zz.pdf")).toBe(
        "kuppi/u1/%zz.pdf",
      );
    });
  });
});

describe("storageMode", () => {
  it("prefers s3 over blob when both are configured", async () => {
    await withEnv(
      {
        S3_ENDPOINT: "http://localhost:9000",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        BLOB_READ_WRITE_TOKEN: "blob-token",
      },
      async () => {
        const { storageMode } = await import("./storage");
        expect(storageMode()).toBe("s3");
      },
    );
  });

  it("falls back to blob when only the Blob token is set", async () => {
    await withEnv({ S3_ENDPOINT: "", BLOB_READ_WRITE_TOKEN: "blob-token" }, async () => {
      const { storageMode } = await import("./storage");
      expect(storageMode()).toBe("blob");
    });
  });

  it("falls back to local when nothing is configured", async () => {
    await withEnv({ S3_ENDPOINT: "", BLOB_READ_WRITE_TOKEN: "" }, async () => {
      const { storageMode } = await import("./storage");
      expect(storageMode()).toBe("local");
    });
  });
});

afterEach(() => {
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_ACCESS_KEY_ID;
  delete process.env.S3_SECRET_ACCESS_KEY;
});
