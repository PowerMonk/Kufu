// usage.ts - Tracks context-window saturation across an engine run.
//
// "Saturation" here means: how much of the configured `num_ctx` have we
// spent across all LLM calls in this run? Each call reports its own
// prompt_eval_count and eval_count; we accumulate them. The per-step
// stderr line shows prev -> new saturation so the operator can read
// off how many more calls of this size the model can absorb before
// hitting the context ceiling.
//
// We also sample VRAM via Ollama's GET /api/ps so the ledger records
// the model's actual residency. This is a secondary signal: the primary
// metric (saturation) is logical and reproducible.
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
  prev_sat_pct: number;
  new_sat_pct: number;
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
  saturation_peak_pct: number;
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
  private sat_peak = 0;
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

    const prev_sat = this.saturationPct(this.cum_in);
    this.cum_in += in_tokens;
    this.cum_out += out_tokens;
    this.cum_total = this.cum_in + this.cum_out;
    const new_sat = this.saturationPct(this.cum_in);
    if (new_sat > this.sat_peak) this.sat_peak = new_sat;

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
      // /api/ps failing is not fatal — saturation is the primary metric.
      vram = null;
    }

    const row: UsageRow = {
      step,
      call_index: idx,
      in_tokens,
      out_tokens,
      total_tokens: in_tokens + out_tokens,
      prev_sat_pct: prev_sat,
      new_sat_pct: new_sat,
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
      saturation_peak_pct: this.sat_peak,
      total_in_tokens: this.cum_in,
      total_out_tokens: this.cum_out,
      total_tokens: this.cum_total,
      vram_peak_bytes: this.vram_peak,
    };

    await mkdir(dirname(LEDGER_PATH), { recursive: true });
    await writeFile(LEDGER_PATH, renderLedger(ledger), "utf8");

    console.error(
      `[usage] DONE peak_sat=${this.sat_peak.toFixed(1)}% ` +
        `total=${this.cum_total} (in=${this.cum_in} out=${this.cum_out}) ` +
        `vram_peak=${formatBytes(this.vram_peak)} ` +
        `ledger=${LEDGER_PATH}`,
    );
  }

  /** Returns saturation as a percentage of num_ctx for a given token count. */
  private saturationPct(tokens: number): number {
    if (this.num_ctx <= 0) return 0;
    return (tokens / this.num_ctx) * 100;
  }

  /** Prints the per-call stderr line. */
  private printRow(row: UsageRow): void {
    const step = row.step.padEnd(14);
    const delta = `${row.prev_sat_pct.toFixed(1)}% -> ${row.new_sat_pct.toFixed(1)}%`;
    const vram = row.vram_bytes === null ? "n/a" : formatBytes(row.vram_bytes);
    console.error(
      `[usage] step=${step} call=${row.call_index} ` +
        `in=${row.in_tokens} out=${row.out_tokens} total=${row.total_tokens} ` +
        `sat ${delta} ` +
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
    "prev_sat".padStart(10) +
    "new_sat".padStart(10) +
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
        `${r.prev_sat_pct.toFixed(1)}%`.padStart(10) +
        `${r.new_sat_pct.toFixed(1)}%`.padStart(10) +
        String(r.cum_in).padStart(9) +
        String(r.cum_out).padStart(10) +
        String(r.cum_total).padStart(10) +
        vram.padStart(10),
    );
  }

  lines.push("");
  lines.push(`saturation_peak : ${ledger.saturation_peak_pct.toFixed(1)}%`);
  lines.push(`total_in_tokens  : ${ledger.total_in_tokens}`);
  lines.push(`total_out_tokens : ${ledger.total_out_tokens}`);
  lines.push(`total_tokens     : ${ledger.total_tokens}`);
  lines.push(`vram_peak        : ${formatBytes(ledger.vram_peak_bytes)}`);
  return lines.join("\n") + "\n";
}
