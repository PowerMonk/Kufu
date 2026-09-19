// eval/contract.ts - Zod schemas for evaluator output.
//
// All evaluator layers return a schema-matching object. The unified
// EvalReport assembles them + cost into a single typed structure that
// gets persisted to <outDir>/eval.json.
//
// Schemas are intentionally permissive in extras but strict on required
// fields. This lets us add fields without breaking existing reports.

import { z } from "zod";

/** A single check inside any layer. */
export const CheckResultSchema = z.object({
  id: z.string(),
  pass: z.boolean(),
  detail: z.string().optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

/** Layer 1: task correctness (requirements matching). */
export const TaskCorrectnessResultSchema = z.object({
  layer: z.literal("task"),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  checks: z.array(CheckResultSchema),
});
export type TaskCorrectnessResult = z.infer<typeof TaskCorrectnessResultSchema>;

/** Layer 2: structural HTML/code validation. */
export const StructuralResultSchema = z.object({
  layer: z.literal("structural"),
  html_errors: z.number().int().nonnegative(),
  accessibility_issues: z.number().int().nonnegative(),
  checks_passed: z.number().int().nonnegative(),
  checks_total: z.number().int().nonnegative(),
  checks: z.array(CheckResultSchema),
});
export type StructuralResult = z.infer<typeof StructuralResultSchema>;

/** Layer 3: code-quality heuristics. */
export const CodeQualityResultSchema = z.object({
  layer: z.literal("quality"),
  loc: z.number().int().nonnegative(),
  file_count: z.number().int().nonnegative(),
  asset_count: z.number().int().nonnegative(),
  broken_imports: z.number().int().nonnegative(),
  syntax_errors: z.number().int().nonnegative(),
  unused_symbols: z.number().int().nonnegative(),
  details: z.array(CheckResultSchema).optional(),
});
export type CodeQualityResult = z.infer<typeof CodeQualityResultSchema>;

/** Layer 4 stub (visual / runtime). Skipped unless implemented. */
export const VisualResultSchema = z.object({
  layer: z.literal("visual"),
  skipped: z.boolean(),
  detail: z.string().optional(),
});
export type VisualResult = z.infer<typeof VisualResultSchema>;

/** Cost bundle, copied from `BenchmarkRecord`. */
export const CostSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
});
export type Cost = z.infer<typeof CostSchema>;

/** Aggregate report. Layers are optional so we can ship them incrementally. */
export const EvalReportSchema = z.object({
  task: z.string(),
  passed: z.boolean(),
  output_kind: z.string(),
  requirements: z
    .object({
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .optional(),
  structural: StructuralResultSchema.optional(),
  code: CodeQualityResultSchema.optional(),
  visual: VisualResultSchema.optional(),
  cost: CostSchema,
  timestamp: z.string(),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;
