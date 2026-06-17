// tests/planner.test.ts
import { expect, test } from "bun:test";
import { runPlanner } from "../src/planner.ts";
import type { OllamaChatResult } from "../src/types.ts";

/** A fake `chat` that returns canned content and metrics. */
function fakeChat(respondWith: string): (req: unknown) => Promise<OllamaChatResult> {
  return async (): Promise<OllamaChatResult> => ({
    content: respondWith,
    thinking: "thought",
    prompt_eval_count: 100,
    eval_count: 25,
    total_duration_ns: 500_000_000,
  });
}

test("runPlanner returns a validated PlannerTask from a clean JSON response", async () => {
  const fake = fakeChat(JSON.stringify({
    task: "A landing page with a hero section and a footer.",
    preferredOutcome: "eval/index.html",
    requiredFiles: ["eval/readme.md"],
    action: "UPDATE",
  }));
  const { task, result } = await runPlanner({
    model: "m",
    num_ctx: 4096,
    userRequest: "make a landing page",
    availableFiles: ["eval/index.html", "eval/readme.md", "eval/styles.css"],
    chat: fake as never,
  });
  expect(task.preferredOutcome).toBe("eval/index.html");
  expect(task.action).toBe("UPDATE");
  expect(result.prompt_eval_count).toBe(100);
});

test("runPlanner strips markdown fences", async () => {
  const fake = fakeChat("```json\n" + JSON.stringify({
    task: "A simple page.",
    preferredOutcome: "p.txt",
    requiredFiles: [],
    action: "CREATE",
  }) + "\n```");
  const { task } = await runPlanner({
    model: "m",
    num_ctx: 4096,
    userRequest: "x",
    availableFiles: [],
    chat: fake as never,
  });
  expect(task.preferredOutcome).toBe("p.txt");
});

test("runPlanner rejects an invalid JSON response", async () => {
  const fake = fakeChat("not json");
  expect(
    runPlanner({
      model: "m",
      num_ctx: 4096,
      userRequest: "x",
      availableFiles: [],
      chat: fake as never,
    }),
  ).rejects.toThrow(/invalid JSON/);
});

test("runPlanner rejects a requiredFile that doesn't exist in the repo", async () => {
  const fake = fakeChat(JSON.stringify({
    task: "A new page.",
    preferredOutcome: "new.ts",
    requiredFiles: ["nope.ts"],
    action: "CREATE",
  }));
  expect(
    runPlanner({
      model: "m",
      num_ctx: 4096,
      userRequest: "x",
      availableFiles: ["a.ts"],
      chat: fake as never,
    }),
  ).rejects.toThrow(/does not exist/);
});

test("runPlanner rejects an action that is not in the enum", async () => {
  const fake = fakeChat(JSON.stringify({
    task: "A new page.",
    preferredOutcome: "new.ts",
    requiredFiles: [],
    action: "REWRITE",
  }));
  expect(
    runPlanner({
      model: "m",
      num_ctx: 4096,
      userRequest: "x",
      availableFiles: [],
      chat: fake as never,
    }),
  ).rejects.toThrow();
});
