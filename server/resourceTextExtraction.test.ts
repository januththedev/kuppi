import { describe, expect, it } from "vitest";
import { hasEnoughQuizSource, prepareQuizSource } from "./resourceTextExtraction";

describe("Kuppi quiz source preparation", () => {
  it("normalizes and caps extracted source text before AI generation", () => {
    expect(prepareQuizSource("  One\n\nTwo  ")).toBe("One Two");
    expect(prepareQuizSource("x".repeat(13000))).toHaveLength(12000);
    expect(hasEnoughQuizSource("short")).toBe(false);
    expect(hasEnoughQuizSource("x".repeat(120))).toBe(true);
  });
});
