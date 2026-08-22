import { describe, expect, it } from "vitest";
import { buildContributionRanking } from "./contributionRank";
import { MAX_UPLOAD_BYTES, safeStorageName, validateResourceUpload } from "./resourceSafety";

describe("Kuppi resource workflows", () => {
  it("rejects oversized or empty uploads and keeps generated storage names path-safe", () => {
    expect(validateResourceUpload({ originalFileName: "", base64Length: 1, byteLength: 1 })).toBe("A file name is required.");
    expect(validateResourceUpload({ originalFileName: "notes.pdf", base64Length: 1, byteLength: 0 })).toBe("The selected file is empty.");
    expect(validateResourceUpload({ originalFileName: "notes.pdf", base64Length: MAX_UPLOAD_BYTES * 2, byteLength: MAX_UPLOAD_BYTES + 1 })).toBe("Files must be 25 MB or smaller.");
    const key = safeStorageName("../../A/L Physics (final).pdf");
    expect(key).not.toContain("/");
    expect(key).toMatch(/\.pdf$/);
  });

  it("calculates rank from real uploads and likes without awarding points to non-contributors", () => {
    const { scores, ranking } = buildContributionRanking(
      [1, 2, 3],
      [{ id: 11, authorId: 2 }, { id: 12, authorId: 1 }],
      [{ resourceId: 11 }, { resourceId: 11 }, { resourceId: 12 }],
    );
    expect(scores.get(2)).toBe(12);
    expect(scores.get(1)).toBe(11);
    expect(scores.get(3)).toBe(0);
    expect(ranking).toEqual([{ userId: 2, score: 12 }, { userId: 1, score: 11 }]);
  });
});
