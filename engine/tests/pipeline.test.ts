// tests/pipeline.test.ts
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runPipeline } from "../src/pipeline.ts";
import type { OllamaChatResult } from "../src/types.ts";

/** A fake `chat` that returns different content on the first vs second call. */
function fakeChat(plan: string, impl: string): (req: unknown) => Promise<OllamaChatResult> {
  let calls = 0;
  return async (): Promise<OllamaChatResult> => {
    calls += 1;
    return {
      content: calls === 1 ? plan : impl,
      thinking: "",
      prompt_eval_count: 100,
      eval_count: 50,
      total_duration_ns: 500_000_000,
    };
  };
}

test("runPipeline walks the repo, plans, fetches, implements, and writes artifacts", async () => {
  const repo = await mkdtemp(join(tmpdir(), "kufu-pipe-"));
  try {
    await writeFile(join(repo, "readme.md"), "# hi");
    await writeFile(join(repo, "styles.css"), "body{}");

    const out = await mkdtemp(join(tmpdir(), "kufu-out-"));
    try {
      const plan = JSON.stringify({
        id: "t",
        task: "tweak readme",
        preferredOutcome: "readme.md",
        requiredFiles: ["readme.md"],
        action: "UPDATE",
      });
      const impl = "updated readme body";
      const result = await runPipeline({
        model: "m",
        num_ctx: 4096,
        repo,
        promptText: "do it",
        promptFile: "prompts.md",
        outDir: out,
        chat: fakeChat(plan, impl) as never,
      });
      expect(result.task.preferredOutcome).toBe("readme.md");
      expect(result.implementerContent).toBe(impl);
      expect(result.record.steps.map((s) => s.name)).toEqual(["planner", "implementer"]);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("runPipeline fails if the planner asks for a missing file", async () => {
  const repo = await mkdtemp(join(tmpdir(), "kufu-pipe-"));
  try {
    const out = await mkdtemp(join(tmpdir(), "kufu-out-"));
    try {
      const plan = JSON.stringify({
        id: "t",
        task: "x",
        preferredOutcome: "nope.md",
        requiredFiles: ["does-not-exist.md"],
        action: "CREATE",
      });
      expect(
        runPipeline({
          model: "m",
          num_ctx: 4096,
          repo,
          promptText: "x",
          promptFile: "prompts.md",
          outDir: out,
          chat: fakeChat(plan, "ignored") as never,
        }),
      ).rejects.toThrow(/does not exist/);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
