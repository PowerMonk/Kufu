// prompts.ts - Builds the system and user prompts for both agents.
//
// The planner has a system prompt because it needs to be told:
//   - it cannot see file contents,
//   - requiredFiles must exist in the file list,
//   - preferredOutcome may be a brand-new file (CREATE is allowed).
//
// The implementer has a system prompt that says:
//   - assume missing files do not exist,
//   - output the complete updated target file.
//
// Per the user's spec: no example repository tree in the planner prompt
// (it would confuse the model). The actual file list is appended at
// runtime, drawn from the real repository.

/** Planner system prompt. Small, role-only. */
export function buildPlannerSystemPrompt(): string {
  return [
    "You are the Planner for Kufu.",
    "You see only file NAMES, never file contents.",
    "Based on the file names and the user's request, decide:",
    "  - which file the implementer should produce or modify (preferredOutcome),",
    "  - which other files the implementer must be allowed to read (requiredFiles),",
    "  - and what action to take: CREATE, UPDATE, or DELETE.",
    "",
    "Rules:",
    "  - You may only pick files that appear in the file names list.",
    "  - requiredFiles is exhaustive. The implementer will NOT be given any other file.",
    "  - preferredOutcome MAY be a brand-new file (use action CREATE).",
    "  - Prefer CREATE for new functionality, UPDATE for small changes, DELETE sparingly.",
    "  - `task` is OBLIGATORY. Your JSON output is invalid without it.",
    "    `task` describes what preferredOutcome should become or contain.",
    "    It must be a concrete, descriptive sentence (20+ words is a good target).",
    "    Do not repeat the action verb. Good: 'A landing page with a hero section,",
    "    an agents section, embedded CSS, and a footer.' Bad: 'UPDATE'. Bad: 'Modify index.html'.",
    "    Bad (also rejected): an empty string or missing field.",
    "  - Your JSON output MUST contain ALL FOUR fields: task, preferredOutcome,",
    "    requiredFiles, action. Omitting any field invalidates your response.",
    "  - Respond as a single JSON object matching the schema. No prose, no markdown fences.",
  ].join("\n");
}

/** Planner user prompt: just the file list and the user's request. */
export function buildPlannerUserPrompt(
  fileNames: string[],
  userRequest: string,
): string {
  const list = fileNames.length === 0
    ? "(the repository is empty)"
    : fileNames.map((f) => `- ${f}`).join("\n");

  return [
    "Repository file names:",
    list,
    "",
    "User request:",
    userRequest,
  ].join("\n");
}

/** Implementer system prompt. Brief: the model already knows how to write code. */
export function buildImplementerSystemPrompt(): string {
  return [
    "You are the Implementer for Kufu.",
    "You will receive a single task and the exact files the Planner selected.",
    "Assume any file not present in the provided context does not exist.",
    "Do not request additional files.",
    "Output the complete updated target file. No prose, no markdown fences.",
  ].join("\n");
}

/** Implementer user prompt: task + concatenated file contents. */
export function buildImplementerUserPrompt(
  task: string,
  preferredOutcome: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  fileContents: string,
): string {
  return [
    `Task: ${task}`,
    `Target file: ${preferredOutcome}`,
    `Action: ${action}`,
    "",
    "File contents the Planner selected:",
    fileContents || "(none)",
    "",
    "Output the complete updated content of the target file.",
  ].join("\n");
}
