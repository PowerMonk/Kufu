// types.ts - Shared types across the engine.

import type { PlannerTask } from "./schema.ts";

/** A single step in a benchmark report. */
export interface StepMetric {
  name: string;
  in_tokens: number;
  out_tokens: number;
  duration_ms: number;
}

/** One run of the engine (pipeline or single). */
export interface BenchmarkRecord {
  mode: "pipeline" | "single";
  model: string;
  num_ctx: number;
  prompt_file: string;
  steps: StepMetric[];
  total_in_tokens: number;
  total_out_tokens: number;
  total_duration_ms: number;
}

/** The parsed response from a single Ollama /api/chat call. */
export interface OllamaChatResult {
  content: string;
  thinking: string;
  prompt_eval_count: number;
  eval_count: number;
  total_duration_ns: number;
}

/** All the inputs a pipeline run needs. */
export interface PipelineInputs {
  model: string;
  num_ctx: number;
  repo: string;
  promptText: string;
  promptFile: string;
  outDir: string;
  chat: typeof import("./ollama.ts").default;
}

/** Outputs of a pipeline run. */
export interface PipelineOutputs {
  task: PlannerTask;
  implementerContent: string;
  record: BenchmarkRecord;
}

/** All the inputs a single-model run needs. */
export interface SingleInputs {
  model: string;
  num_ctx: number;
  promptText: string;
  promptFile: string;
  outDir: string;
  chat: typeof import("./ollama.ts").default;
  /** Enable thinking mode (default: false). */
  thinking?: boolean;
}

/** Outputs of a single-model run. */
export interface SingleOutputs {
  content: string;
  record: BenchmarkRecord;
}
