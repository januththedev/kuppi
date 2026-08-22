import { describe, expect, it } from "vitest";
import { kuppiQuizSystemPrompt, mcqSchema } from "./openRouterQuiz";

describe("Kuppi AI quiz contract", () => {
  it("requires a constrained MCQ-only response", () => {
    expect(kuppiQuizSystemPrompt()).toContain("exactly four plausible options");
    expect(mcqSchema.safeParse({ questions: [{ question: "What is the main idea of this note?", options: ["A", "B", "C", "D"], correctIndex: 0, explanation: "The note states this directly." }, { question: "Which detail supports the explanation?", options: ["A", "B", "C", "D"], correctIndex: 1, explanation: "This follows from the supplied context." }, { question: "What should a student recall first?", options: ["A", "B", "C", "D"], correctIndex: 2, explanation: "This is the key point in the material." }] }).success).toBe(true);
  });
});
