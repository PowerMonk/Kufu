// Verifies that runPlanner dumps the raw model output + Zod issues to
// <outDir>/planner.failed.json when schema validation fails, before
// re-throwing. This is the diagnostic safety net that lets us inspect
// what the model actually produced when the next pipeline run fails.
import { test, expect } from "bun:test";
import { rm } from "node:fs/promises";

test("runPlanner dumps raw output on Zod failure", async () => {
  const tmp = "engine/eval/run-test-faildump";
  await rm(tmp, { recursive: true, force: true });

  const fakeChat = async () => ({
    content: '{"task": "x", "preferredOutcome": "y", "requiredFiles": [], "action": "INVALID_ACTION"}',
    thinking: "",
    prompt_eval_count: 10,
    eval_count: 5,
    total_duration_ns: 1_000_000,
  });

  const { runPlanner } = await import("./planner.ts");

  let threw = false;
  try {
    await runPlanner({
      model: "fake:model",
      num_ctx: 1024,
      userRequest: "test",
      availableFiles: [],
      outDir: tmp,
      chat: fakeChat as any,
    });
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);

  const file = Bun.file(`${tmp}/planner.failed.json`);
  expect(await file.exists()).toBe(true);
  const text = await file.text();
  expect(text).toContain("INVALID_ACTION");
  expect(text).toContain('"issues"');

  await rm(tmp, { recursive: true, force: true });
});
