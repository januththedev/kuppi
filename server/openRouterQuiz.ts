import { z } from "zod";

export const mcqSchema = z.object({
  questions: z.array(z.object({ question: z.string().min(8).max(300), options: z.array(z.string().min(1).max(180)).length(4), correctIndex: z.number().int().min(0).max(3), explanation: z.string().min(8).max(400) })).min(3).max(10),
});

export function kuppiQuizSystemPrompt() {
  return `You are Kuppi Quiz Builder, a careful Sri Lankan student-learning assistant. Generate only rigorous multiple-choice questions from the supplied study-resource context. Return valid JSON only, matching exactly {"questions":[{"question":"","options":["","","", ""],"correctIndex":0,"explanation":""}]}. Create 5 questions unless the material is too short, then create 3. Each question must be answerable from the supplied context; do not invent facts, people, citations, statistics, or curriculum requirements. Use clear neutral English suitable for the indicated study level. Provide exactly four plausible options, exactly one correct answer, and a concise explanation grounded in the supplied context. Never include unsafe instructions, personal data, or claims about having read unseen file contents.`;
}

export async function generateOpenRouterMcq(context: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("AI quizzes are not configured. Set OPENROUTER_API_KEY in your self-hosted server environment.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "openrouter/free", temperature: 0.3, max_tokens: 1800, messages: [{ role: "system", content: kuppiQuizSystemPrompt() }, { role: "user", content: context.slice(0, 12000) }] }) });
  if (!response.ok) throw new Error("Kuppi could not generate this quiz right now.");
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content?.trim().replace(/^```json\s*|\s*```$/g, "");
  return mcqSchema.parse(JSON.parse(content || "{}"));
}
