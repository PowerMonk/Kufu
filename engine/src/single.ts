// single.ts - Baseline run: a single LLM call with the user's prompt.

import { mkdir, writeFile } from "node:fs/promises";

import { Benchmark, writeReport } from "./benchmark.ts";
import { UsageTracker } from "./usage.ts";
import { runEvaluation } from "./eval/runner.ts";
import type { Cost } from "./eval/contract.ts";
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

    if (inputs.thinking && result.thinking) {
      await writeFile(`${inputs.outDir}/thinking.txt`, result.thinking);
    }

    const record = bench.build();
    await writeReport(record, inputs.outDir);

    if (inputs.taskManifest) {
      await writeEval(inputs.outDir, inputs.taskManifest, result.content, record);
    }

    return { content: result.content, record };
  } finally {
    await usage.flush();
  }
}

async function writeEval(
  outDir: string,
  manifest: import("./eval/task.ts").TaskManifest,
  output: string,
  record: import("./types.ts").BenchmarkRecord,
): Promise<void> {
  const cost: Cost = {
    input_tokens: record.total_in_tokens,
    output_tokens: record.total_out_tokens,
    total_tokens: record.total_in_tokens + record.total_out_tokens,
    duration_ms: record.total_duration_ms,
  };
  const evalReport = await runEvaluation(manifest, output, cost);
  await writeFile(`${outDir}/eval.json`, JSON.stringify(evalReport, null, 2));
  console.error(
    `[eval] task=${evalReport.task} passed=${evalReport.passed} ` +
      `→ ${outDir}/eval.json`,
  );
}
