// usage.ts - Tracks per-call token utilization and writes a ledger.
//
// Two metrics are surfaced:
//   1. Per-call utilization: how much of `num_ctx` did THIS call consume?
//      (in_tok / num_ctx, out_tok / num_ctx, total / num_ctx). Each Ollama
//      call is an independent context window — they don't stack. This is
//      the honest "how full is this call's brain?" metric.
//   2. Cumulative cost: in_tok + out_tok + total summed across calls in
//      the run. This is the "how much did this run cost?" metric. We
//      track it separately because it has a different meaning.
//
// VRAM is sampled via Ollama's GET /api/ps and recorded as a secondary
// signal so we can confirm the model is actually loaded.
//
// At the end of the run we rewrite `engine/state/usage.txt` with the
// full ledger. Rewriting (not appending) keeps the file readable after
// any run and avoids unbounded growth.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { listLoadedModels } from "./ollama.ts";

const LEDGER_PATH = "engine/state/usage.txt";

/** A single LLM call's contribution to the usage ledger. */
export interface UsageRow {
  step: string;
  call_index: number;
  in_tokens: number;
  out_tokens: number;
  total_tokens: number;
  in_pct: number;
  out_pct: number;
  tot_pct: number;
  cum_in: number;
  cum_out: number;
  cum_total: number;
  vram_bytes: number | null;
}

/** The full ledger written to disk at the end of a run. */
export interface UsageLedger {
  run_id: string;
  model: string;
  num_ctx: number;
  started_iso: string;
  rows: UsageRow[];
  peak_per_call_tot_pct: number;
  total_in_tokens: number;
  total_out_tokens: number;
  total_tokens: number;
  vram_peak_bytes: number;
}

/**
 * Accumulates per-call token usage and surfaces a stderr line + a
 * rewritten ledger file at the end of the run.
 *
 * The tracker is single-run: construct one per pipeline/single invocation.
 * It is not safe to share across concurrent runs because it mutates
 * internal state without locking.
 */
export class UsageTracker {
  private rows: UsageRow[] = [];
  private cum_in = 0;
  private cum_out = 0;
  private cum_total = 0;
  private vram_peak = 0;
  private peak_per_call_tot = 0;
  private per_step_index = new Map<string, number>();
  private readonly started_iso = new Date().toISOString();

  constructor(
    private readonly run_id: string,
    private readonly model: string,
    private readonly num_ctx: number,
  ) {}

  /**
   * Records one LLM call. `in_tokens`/`out_tokens` come straight from
   * the Ollama response's prompt_eval_count / eval_count. `vram_bytes`
   * is optional — pass null if /api/ps isn't reachable.
   *
   * Returns the row that was recorded so callers can log it without
   * duplicating the formatting logic.
   */
  async record(
    step: string,
    in_tokens: number,
    out_tokens: number,
  ): Promise<UsageRow> {
    const idx = (this.per_step_index.get(step) ?? 0) + 1;
    this.per_step_index.set(step, idx);

    this.cum_in += in_tokens;
    this.cum_out += out_tokens;
    const total = in_tokens + out_tokens;
    this.cum_total = this.cum_in + this.cum_out;

    const in_pct = this.utilizationPct(in_tokens);
    const out_pct = this.utilizationPct(out_tokens);
    const tot_pct = this.utilizationPct(total);
    if (tot_pct > this.peak_per_call_tot) this.peak_per_call_tot = tot_pct;

    let vram: number | null = null;
    try {
      const loaded = await listLoadedModels();
      const mine = loaded.find((m) => m.name === this.model);
      const v = mine?.size_vram ?? 0;
      if (v > 0) {
        vram = v;
        if (v > this.vram_peak) this.vram_peak = v;
      }
    } catch {
      vram = null;
    }

    const row: UsageRow = {
      step,
      call_index: idx,
      in_tokens,
      out_tokens,
      total_tokens: total,
      in_pct,
      out_pct,
      tot_pct,
      cum_in: this.cum_in,
      cum_out: this.cum_out,
      cum_total: this.cum_total,
      vram_bytes: vram,
    };
    this.rows.push(row);
    this.printRow(row);
    return row;
  }

  /**
   * Writes the full ledger to `engine/state/usage.txt` (rewritten on
   * every call) and prints a final summary line to stderr.
   */
  async flush(): Promise<void> {
    const ledger: UsageLedger = {
      run_id: this.run_id,
      model: this.model,
      num_ctx: this.num_ctx,
      started_iso: this.started_iso,
      rows: this.rows,
      peak_per_call_tot_pct: this.peak_per_call_tot,
      total_in_tokens: this.cum_in,
      total_out_tokens: this.cum_out,
      total_tokens: this.cum_total,
      vram_peak_bytes: this.vram_peak,
    };

    await mkdir(dirname(LEDGER_PATH), { recursive: true });
    await writeFile(LEDGER_PATH, renderLedger(ledger), "utf8");

    console.error(
      `[usage] DONE peak_per_call_tot%=${this.peak_per_call_tot.toFixed(1)} ` +
        `cost=(in=${this.cum_in} out=${this.cum_out} total=${this.cum_total}) ` +
        `vram_peak=${formatBytes(this.vram_peak)} ` +
        `ledger=${LEDGER_PATH}`,
    );
  }

  /** Returns a count as a percentage of num_ctx. */
  private utilizationPct(tokens: number): number {
    if (this.num_ctx <= 0) return 0;
    return (tokens / this.num_ctx) * 100;
  }

  /** Prints the per-call stderr line. */
  private printRow(row: UsageRow): void {
    const step = row.step.padEnd(14);
    const vram = row.vram_bytes === null ? "n/a" : formatBytes(row.vram_bytes);
    console.error(
      `[usage] step=${step} call=${row.call_index} ` +
        `in=${row.in_tokens} out=${row.out_tokens} total=${row.total_tokens} ` +
        `in% ${row.in_pct.toFixed(1)} out% ${row.out_pct.toFixed(1)} tot% ${row.tot_pct.toFixed(1)} ` +
        `cum_in=${row.cum_in} cum_out=${row.cum_out} cum_total=${row.cum_total} ` +
        `vram=${vram}`,
    );
  }
}

/** Formats a byte count as a human-readable string (e.g. "4.21GB"). */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)}${units[i]}`;
}

/** Renders the ledger as a fixed-width plain-text table for `usage.txt`. */
function renderLedger(ledger: UsageLedger): string {
  const lines: string[] = [];
  lines.push(`run_id    : ${ledger.run_id}`);
  lines.push(`model     : ${ledger.model}`);
  lines.push(`num_ctx   : ${ledger.num_ctx}`);
  lines.push(`started   : ${ledger.started_iso}`);
  lines.push("");

  const header =
    "step".padEnd(14) +
    "call".padStart(5) +
    "in_tok".padStart(8) +
    "out_tok".padStart(9) +
    "total".padStart(9) +
    "in%".padStart(7) +
    "out%".padStart(7) +
    "tot%".padStart(7) +
    "cum_in".padStart(9) +
    "cum_out".padStart(10) +
    "cum_tot".padStart(10) +
    "vram".padStart(10);
  lines.push(header);

  for (const r of ledger.rows) {
    const vram = r.vram_bytes === null ? "n/a" : formatBytes(r.vram_bytes);
    lines.push(
      r.step.padEnd(14) +
        String(r.call_index).padStart(5) +
        String(r.in_tokens).padStart(8) +
        String(r.out_tokens).padStart(9) +
        String(r.total_tokens).padStart(9) +
        `${r.in_pct.toFixed(1)}%`.padStart(7) +
        `${r.out_pct.toFixed(1)}%`.padStart(7) +
        `${r.tot_pct.toFixed(1)}%`.padStart(7) +
        String(r.cum_in).padStart(9) +
        String(r.cum_out).padStart(10) +
        String(r.cum_total).padStart(10) +
        vram.padStart(10),
    );
  }

  lines.push("");
  lines.push("cost_summary:");
  lines.push(`  peak_per_call_tot% : ${ledger.peak_per_call_tot_pct.toFixed(1)}%`);
  lines.push(`  total_in_tokens    : ${ledger.total_in_tokens}`);
  lines.push(`  total_out_tokens   : ${ledger.total_out_tokens}`);
  lines.push(`  total_tokens       : ${ledger.total_tokens}`);
  lines.push(`  vram_peak          : ${formatBytes(ledger.vram_peak_bytes)}`);
  return lines.join("\n") + "\n";
}
