// pipeline.ts - Orchestrates one full planner -> implementer run.

import { mkdir, writeFile } from "node:fs/promises";

import { walkRepo } from "./repo.ts";
import { fetchFiles } from "./files.ts";
import { runPlanner } from "./planner.ts";
import { runImplementer } from "./implementer.ts";
import { Benchmark, writeReport } from "./benchmark.ts";
import { UsageTracker } from "./usage.ts";
import type { PipelineInputs, PipelineOutputs } from "./types.ts";

/**
 * Runs the full pipeline:
 *   1. walk repo
 *   2. planner (with file list)
 *   3. fetch files
 *   4. implementer
 *   5. write artifacts + benchmark report
 *
 * The usage tracker records per-call token counts + saturation on
 * stderr and writes a reusable ledger to engine/state/usage.txt.
 */
export async function runPipeline(inputs: PipelineInputs): Promise<PipelineOutputs> {
  const bench = new Benchmark("pipeline", inputs.model, inputs.num_ctx, inputs.promptFile);
  const usage = new UsageTracker("pipeline", inputs.model, inputs.num_ctx);

  try {
    // 1. Walk the repo deterministically.
    const { files } = await walkRepo(inputs.repo);
    console.log(`[pipeline] repo: ${inputs.repo} (${files.length} files)`);

    // 2. Planner.
    const planner = await runPlanner({
      model: inputs.model,
      num_ctx: inputs.num_ctx,
      userRequest: inputs.promptText,
      availableFiles: files,
      outDir: inputs.outDir,
      chat: inputs.chat,
    });
    bench.record("planner", planner.result.prompt_eval_count, planner.result.eval_count, planner.result.total_duration_ns);
    await usage.record("planner", planner.result.prompt_eval_count, planner.result.eval_count);
    console.log(
      `[pipeline] planner: in=${planner.result.prompt_eval_count} out=${planner.result.eval_count} ` +
      `(${Math.round(planner.result.total_duration_ns / 1_000_000)}ms)`,
    );
    if (planner.result.thinking) {
      console.log(`[pipeline] planner thinking: ${planner.result.thinking.slice(0, 200)}…`);
    }

    // 3. Fetch the files the planner selected.
    const fileContents = await fetchFiles(inputs.repo, planner.task.requiredFiles);
    console.log(`[pipeline] fetched ${planner.task.requiredFiles.length} file(s)`);

    // 4. Implementer.
    const impl = await runImplementer({
      model: inputs.model,
      num_ctx: inputs.num_ctx,
      task: planner.task,
      fileContents,
      chat: inputs.chat,
    });
    bench.record("implementer", impl.result.prompt_eval_count, impl.result.eval_count, impl.result.total_duration_ns);
    await usage.record("implementer", impl.result.prompt_eval_count, impl.result.eval_count);
    console.log(
      `[pipeline] implementer: in=${impl.result.prompt_eval_count} out=${impl.result.eval_count} ` +
      `(${Math.round(impl.result.total_duration_ns / 1_000_000)}ms)`,
    );

    // 5. Write artifacts.
    await mkdir(inputs.outDir, { recursive: true });
    await writeFile(
      `${inputs.outDir}/planner.json`,
      JSON.stringify({ ...planner.task, thinking: planner.result.thinking }, null, 2),
    );
    await writeFile(`${inputs.outDir}/implementer.txt`, impl.content);

    const record = bench.build();
    await writeReport(record, inputs.outDir);

    return { task: planner.task, implementerContent: impl.content, record };
  } finally {
    await usage.flush();
  }
}
