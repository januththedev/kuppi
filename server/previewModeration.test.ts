import { describe, expect, it } from "vitest";
import { documentPreviewMode } from "../client/src/lib/documentPreview";
import { moderationResolution } from "./moderationPolicy";

describe("Kuppi document preview routing", () => {
  it("uses a safe mode based on the declared media type", () => {
    expect(documentPreviewMode("application/pdf")).toBe("document");
    expect(documentPreviewMode("image/png")).toBe("image");
    expect(documentPreviewMode("video/mp4")).toBe("video");
    expect(documentPreviewMode("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("download");
  });
});

describe("Kuppi moderation policy", () => {
  it("maps reviewer actions to the correct report and content state", () => {
    expect(moderationResolution("dismiss")).toEqual({ reportStatus: "dismissed", moderationStatus: null });
    expect(moderationResolution("hide")).toEqual({ reportStatus: "actioned", moderationStatus: "hidden" });
    expect(moderationResolution("remove")).toEqual({ reportStatus: "actioned", moderationStatus: "removed" });
  });
});
