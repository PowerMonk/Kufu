// tests/prompts.test.ts
import { expect, test } from "bun:test";

import {
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  buildImplementerSystemPrompt,
  buildImplementerUserPrompt,
} from "../src/prompts.ts";

test("planner system prompt declares the role and the rules", () => {
  const s = buildPlannerSystemPrompt();
  expect(s).toContain("Planner for Kufu");
  expect(s).toContain("file NAMES");
  expect(s).toContain("requiredFiles is exhaustive");
  expect(s).toContain("preferredOutcome MAY be a brand-new file");
});

test("planner user prompt embeds the file list and the user request", () => {
  const u = buildPlannerUserPrompt(
    ["a.ts", "src/b.ts"],
    "make a card",
  );
  expect(u).toContain("- a.ts");
  expect(u).toContain("- src/b.ts");
  expect(u).toContain("make a card");
  // No example tree: just the list and the request.
  expect(u).not.toContain("Example");
});

test("planner user prompt shows the empty-repo note when no files", () => {
  const u = buildPlannerUserPrompt([], "anything");
  expect(u).toContain("(the repository is empty)");
});

test("implementer system prompt tells the model to assume missing files do not exist", () => {
  const s = buildImplementerSystemPrompt();
  expect(s).toContain("Implementer for Kufu");
  expect(s).toContain("does not exist");
  expect(s).toContain("Do not request additional files");
  expect(s).toContain("complete updated target file");
});

test("implementer user prompt contains the task, target, action, and file contents", () => {
  const u = buildImplementerUserPrompt(
    "Create card",
    "card.astro",
    "CREATE",
    "--- a.ts ---\nbody\n--- end a.ts ---",
  );
  expect(u).toContain("Task: Create card");
  expect(u).toContain("Target file: card.astro");
  expect(u).toContain("Action: CREATE");
  expect(u).toContain("--- a.ts ---");
});

test("implementer user prompt shows (none) when no file contents are provided", () => {
  const u = buildImplementerUserPrompt("t", "p", "CREATE", "");
  expect(u).toContain("(none)");
});
