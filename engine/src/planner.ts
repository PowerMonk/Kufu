// planner.ts - Runs the planner agent and returns a validated PlannerTask.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import defaultChat from "./ollama.ts";
import { PlannerTaskSchema, plannerTaskJsonSchema } from "./schema.ts";
import { buildPlannerSystemPrompt, buildPlannerUserPrompt } from "./prompts.ts";
import type { PlannerTask } from "./schema.ts";
import type { OllamaChatResult } from "./types.ts";

/**
 * Runs the planner and returns a validated task. Throws if the model
 * returns anything that doesn't parse as a PlannerTask, or if the
 * planner asks for a file in `requiredFiles` that doesn't appear in
 * `availableFiles`.
 *
 * If `outDir` is provided and Zod rejects the model's output, we dump
 * the raw response + structured issues to `outDir/planner.failed.json`
 * before re-throwing. This is the diagnostic safety net: without it,
 * a schema failure leaves us with nothing to inspect.
 *
 * `chat` is dependency-injected so tests can stub it. The default is
 * the real Ollama client.
 */
export async function runPlanner(args: {
  model: string;
  num_ctx: number;
  userRequest: string;
  availableFiles: string[];
  outDir?: string;
  chat?: typeof defaultChat;
}): Promise<{ task: PlannerTask; result: OllamaChatResult }> {
  const chat = args.chat ?? defaultChat;
  const messages = [
    { role: "system" as const, content: buildPlannerSystemPrompt() },
    {
      role: "user" as const,
      content: buildPlannerUserPrompt(args.availableFiles, args.userRequest),
    },
  ];

  const result = await chat({
    model: args.model,
    messages,
    num_ctx: args.num_ctx,
    think: true,
    format: plannerTaskJsonSchema(),
  });

  const parsed = parsePlannerContent(result.content);

  let task: PlannerTask;
  try {
    task = PlannerTaskSchema.parse(parsed);
  } catch (err) {
    await dumpFailedPlannerOutput(args, result, err);
    throw err;
  }

  // Defensive check: requiredFiles must be a subset of availableFiles.
  // The system prompt says this, but models slip. Fail loud.
  const available = new Set(args.availableFiles);
  for (const req of task.requiredFiles) {
    if (!available.has(req)) {
      throw new Error(
        `Planner asked for a requiredFile that does not exist in the repository: ${req}`,
      );
    }
  }

  return { task, result };
}

/**
 * Writes the planner's raw output and Zod issues to `outDir/planner.failed.json`.
 * Best-effort: if the write fails (bad path, permission error), we log to
 * stderr but don't mask the original Zod error.
 */
async function dumpFailedPlannerOutput(
  args: {
    model: string;
    num_ctx: number;
    outDir?: string;
  },
  result: OllamaChatResult,
  err: unknown,
): Promise<void> {
  if (!args.outDir) return;

  const issues = err instanceof Error && "issues" in err
    ? (err as unknown as { issues: unknown }).issues
    : null;

  const dump = {
    raw_content: result.content,
    thinking: result.thinking,
    issues,
    model: args.model,
    num_ctx: args.num_ctx,
    prompt_eval_count: result.prompt_eval_count,
    eval_count: result.eval_count,
    timestamp: new Date().toISOString(),
  };

  try {
    await mkdir(args.outDir, { recursive: true });
    await writeFile(
      join(args.outDir, "planner.failed.json"),
      JSON.stringify(dump, null, 2),
      "utf8",
    );
  } catch (writeErr) {
    console.error(
      `[planner] failed to write planner.failed.json: ${(writeErr as Error).message}`,
    );
  }
}

/**
 * Parses the planner's content as JSON. The model occasionally wraps it
 * in ```json fences; we strip those before parsing.
 */
function parsePlannerContent(content: string): unknown {
  const trimmed = content.trim();
  // Strip leading/trailing markdown fences if present.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  // if false, use the original trimmed content. if true, use the content inside the fences.
  const body = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error(
      `Planner returned invalid JSON. Raw content:\n---\n${content}\n---\nParse error: ${(err as Error).message}`,
    );
  }
}
