// tests/single.test.ts
import { expect, test } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSingle } from "../src/single.ts";
import type { OllamaChatResult } from "../src/types.ts";

function fakeChat(content: string): (req: unknown) => Promise<OllamaChatResult> {
  return async (): Promise<OllamaChatResult> => ({
    content,
    thinking: "",
    prompt_eval_count: 10,
    eval_count: 20,
    total_duration_ns: 100_000_000,
  });
}

test("runSingle writes the model output and a report", async () => {
  const out = await mkdtemp(join(tmpdir(), "kufu-single-"));
  try {
    const { content, record } = await runSingle({
      model: "m",
      num_ctx: 4096,
      promptText: "make a thing",
      promptFile: "p.md",
      outDir: out,
      chat: fakeChat("the model said hi") as never,
    });
    expect(content).toBe("the model said hi");
    expect(record.total_in_tokens).toBe(10);
    expect(record.total_out_tokens).toBe(20);

    const txt = await readFile(join(out, "single.txt"), "utf8");
    expect(txt).toBe("the model said hi");
    const report = await readFile(join(out, "report.txt"), "utf8");
    expect(report).toContain("single");
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
