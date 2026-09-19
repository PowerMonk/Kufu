// eval/task.ts - TaskManifest and Requirement types.
//
// A "task" is a single deterministic unit of work the engine runs.
// A manifest declares (a) what kind of output we expect, (b) what
// structured requirements to check (Layer 1), and (c) which layers
// to run. Manifests live in `engine/eval/tasks/<task-id>.json`.
//
// This file deliberately doesn't import zod. Manifests are JSON at
// rest; the runner validates them with Zod when it loads them.

export type OutputKind = "html" | "css" | "ts" | "js" | "json" | "rust";

export type RequirementType =
  | "element"
  | "text"
  | "count"
  | "attr"
  | "style";

export interface TaskRequirement {
  id: string;
  type: RequirementType;
  /** CSS-subset selector: tag, .class, #id, comma-separated OR. */
  selector?: string;
  /** Required substring for `text` type. */
  expected?: string;
  /** For `count` type: inclusive minimum number of matches. */
  min?: number;
  /** For `count` type: inclusive maximum number of matches (optional). */
  max?: number;
  /** For `attr` type. */
  attribute?: string;
  /** For `attr` type. */
  value?: string;
}

export type LayerName = "task" | "structural" | "quality" | "visual";

export interface TaskManifest {
  /** Stable identifier for the task (used in reports and leaderboards). */
  task_id: string;
  /** What kind of output the model is expected to produce. */
  output_kind: OutputKind;
  /** Layer 1 requirements. Empty array means Layer 1 is a no-op. */
  requirements: TaskRequirement[];
  /** Which layers to run. Omit to run all that apply to `output_kind`. */
  layers?: LayerName[];
  /** Path (relative to manifest) to write the post-implementer file. */
  expected_output_path?: string;
}
