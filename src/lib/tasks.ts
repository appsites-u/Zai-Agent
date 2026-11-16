export type RunDecision =
  | { kind: "run" }
  | { kind: "error"; reason: "no_agent" | "agent_disabled" | "task_closed" }
  | { kind: "request_approval" }
  | { kind: "awaiting_approval" };

export function decideRunAction(
  task: { status: string; requires_approval: boolean; approved_at: string | null },
  agent: { enabled: boolean } | null,
  hasPendingApproval: boolean,
): RunDecision {
  if (task.status === "cancelled") return { kind: "error", reason: "task_closed" };
  if (!agent) return { kind: "error", reason: "no_agent" };
  if (!agent.enabled) return { kind: "error", reason: "agent_disabled" };
  if (task.requires_approval && !task.approved_at) {
    return hasPendingApproval ? { kind: "awaiting_approval" } : { kind: "request_approval" };
  }
  return { kind: "run" };
}

export const RUN_ERROR_TEXT: Record<"no_agent" | "agent_disabled" | "task_closed", string> = {
  no_agent: "Assign an agent to this task before running it.",
  agent_disabled: "The assigned agent is disabled.",
  task_closed: "This task was cancelled.",
};

export function buildTaskPrompt(task: { title: string; description: string }, projectName: string) {
  return `Project: ${projectName}\nTask: ${task.title}\n\n${task.description || "(no further details)"}\n\nComplete this task. Respond with the deliverable only.`;
}
