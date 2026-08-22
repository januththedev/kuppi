export type ModerationAction = "dismiss" | "hide" | "remove";

export function moderationResolution(action: ModerationAction) {
  if (action === "dismiss") return { reportStatus: "dismissed" as const, moderationStatus: null };
  return { reportStatus: "actioned" as const, moderationStatus: action === "hide" ? "hidden" as const : "removed" as const };
}
