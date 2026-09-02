// single.ts - Baseline run: a single LLM call with the user's prompt.

import { mkdir, writeFile } from "node:fs/promises";

import { Benchmark, writeReport } from "./benchmark.ts";
import { UsageTracker } from "./usage.ts";
import type { SingleInputs, SingleOutputs } from "./types.ts";

/**
 * Runs the single-model baseline: the model sees ONLY the user prompt.
 * No planning, no file fetching. The result is whatever the model produces.
 *
 * The usage tracker records per-call token counts + saturation on
 * stderr and writes a reusable ledger to engine/state/usage.txt.
 */
export async function runSingle(inputs: SingleInputs): Promise<SingleOutputs> {
  const bench = new Benchmark(
    "single",
    inputs.model,
    inputs.num_ctx,
    inputs.promptFile,
  );
  const usage = new UsageTracker("single", inputs.model, inputs.num_ctx);

  try {
    const messages = [{ role: "user" as const, content: inputs.promptText }];
    const result = await inputs.chat({
      model: inputs.model,
      messages,
      num_ctx: inputs.num_ctx,
      think: inputs.thinking ?? false,
    });

    bench.record(
      "single",
      result.prompt_eval_count,
      result.eval_count,
      result.total_duration_ns,
    );
    await usage.record("single", result.prompt_eval_count, result.eval_count);
    console.log(
      `[single] in=${result.prompt_eval_count} out=${result.eval_count} ` +
        `(${Math.round(result.total_duration_ns / 1_000_000)}ms)`,
    );

    await mkdir(inputs.outDir, { recursive: true });
    await writeFile(`${inputs.outDir}/single.txt`, result.content);

    // Save thinking trace if thinking was enabled and there's content
    if (inputs.thinking && result.thinking) {
      await writeFile(`${inputs.outDir}/thinking.txt`, result.thinking);
    }

    const record = bench.build();
    await writeReport(record, inputs.outDir);

    return { content: result.content, record };
  } finally {
    await usage.flush();
  }
}
