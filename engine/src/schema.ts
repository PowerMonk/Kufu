// schema.ts - Zod schemas for the planner's output.
//
// The schema is the contract between the planner and the rest of the engine.
// We use Zod because it gives us:
//   1. A TS type (z.infer<typeof Schema>)
//   2. A validator (Schema.parse / safeParse)
//   3. A JSON schema (Schema.toJSONSchema) that we send to Ollama as
//      the `format` field, so the model is guided toward a valid shape.
//
// `z.toJSONSchema` was added in Zod 3.24. We pin to ^3.23.8 which already
// exports it under the v4 path; on 3.23.8 we fall back to a small helper
// if `z.toJSONSchema` is not present.

import { z } from "zod";

/** What the planner wants the implementer to do with the target file. */
export const FileActionSchema = z.enum(["CREATE", "UPDATE", "DELETE"]);
export type FileAction = z.infer<typeof FileActionSchema>;

/** The planner's contract. Validated before anything else uses it. */
export const PlannerTaskSchema = z.object({
  id: z.string().min(1),
  task: z.string().min(1),
  preferredOutcome: z.string().min(1),
  requiredFiles: z.array(z.string()),
  action: FileActionSchema,
});
export type PlannerTask = z.infer<typeof PlannerTaskSchema>;

/**
 * Returns a JSON schema for the planner's output, suitable for Ollama's
 * `format` field. We rebuild the shape by hand because Zod's
 * `z.toJSONSchema` exists in newer versions but not older, and we want
 * a stable surface for the model to see.
 */
export function plannerTaskJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      id: { type: "string", description: "A short identifier for this task." },
      task: {
        type: "string",
        description: "What the implementer should do, in one or two sentences.",
      },
      preferredOutcome: {
        type: "string",
        description:
          "The exact file path the implementer should create or modify.",
      },
      requiredFiles: {
        type: "array",
        items: { type: "string" },
        description:
          "Files the implementer must see. These must exist in the repository.",
      },
      action: {
        type: "string",
        enum: ["CREATE", "UPDATE", "DELETE"],
        description: "What the implementer does to preferredOutcome.",
      },
    },
    required: ["id", "task", "preferredOutcome", "requiredFiles", "action"],
  };
}
