// benchmark.ts - Tracks and reports metrics for one engine run.

import type { BenchmarkRecord, StepMetric } from "./types.ts";

/** A running tally of steps. Add one per LLM call. */
export class Benchmark {
  private readonly steps: StepMetric[] = [];
  private readonly startedAt: number;

  constructor(
    private readonly mode: BenchmarkRecord["mode"],
    private readonly model: string,
    private readonly num_ctx: number,
    private readonly prompt_file: string,
  ) {
    this.startedAt = Date.now();
  }

  /** Adds a step from an Ollama response. */
  record(name: string, prompt_eval_count: number, eval_count: number, total_duration_ns: number): void {
    this.steps.push({
      name,
      in_tokens: prompt_eval_count,
      out_tokens: eval_count,
      duration_ms: Math.round(total_duration_ns / 1_000_000),
    });
  }

  /** Builds the final record. Total wall-clock is computed from `Date.now()`. */
  build(): BenchmarkRecord {
    let inT = 0;
    let outT = 0;
    for (const s of this.steps) {
      inT += s.in_tokens;
      outT += s.out_tokens;
    }
    return {
      mode: this.mode,
      model: this.model,
      num_ctx: this.num_ctx,
      prompt_file: this.prompt_file,
      steps: this.steps,
      total_in_tokens: inT,
      total_out_tokens: outT,
      total_duration_ms: Date.now() - this.startedAt,
    };
  }
}

/** Writes a JSON and a human-readable report to `outDir`. */
export async function writeReport(record: BenchmarkRecord, outDir: string): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(outDir, { recursive: true });

  const jsonPath = `${outDir}/report.json`;
  await writeFile(jsonPath, JSON.stringify(record, null, 2));

  const textPath = `${outDir}/report.txt`;
  await writeFile(textPath, renderReport(record));
}

/** Plain-text report with ASCII box drawing, copy-paste safe. */
export function renderReport(record: BenchmarkRecord): string {
  const lines: string[] = [];
  const w = 60;
  const border = (ch: string, left: string, _mid: string, right: string) =>
    left + ch.repeat(w - 2) + right;
  const top = border("─", "┌", "┬", "┐");
  const bot = border("─", "└", "┴", "┘");
  const row = (label: string, value: string) =>
    `│ ${label.padEnd(20)} │ ${value.padEnd(w - 25)} │`;

  lines.push(top);
  lines.push(row("mode", record.mode));
  lines.push(row("model", record.model));
  lines.push(row("num_ctx", String(record.num_ctx)));
  lines.push(row("prompt_file", record.prompt_file));
  lines.push(border("─", "├", "┼", "┤"));
  for (const s of record.steps) {
    lines.push(row(s.name, `in=${s.in_tokens} out=${s.out_tokens} ${s.duration_ms}ms`));
  }
  lines.push(border("─", "├", "┼", "┤"));
  lines.push(row("total in tokens", String(record.total_in_tokens)));
  lines.push(row("total out tokens", String(record.total_out_tokens)));
  lines.push(row("total duration", `${record.total_duration_ms}ms`));
  lines.push(bot);
  return lines.join("\n") + "\n";
}
