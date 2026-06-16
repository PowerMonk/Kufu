// implementer.ts - Runs the implementer agent and returns the raw text output.

import defaultChat from "./ollama.ts";
import { buildImplementerSystemPrompt, buildImplementerUserPrompt } from "./prompts.ts";
import type { PlannerTask } from "./schema.ts";
import type { OllamaChatResult } from "./types.ts";

/**
 * Runs the implementer. Returns the raw string content and the underlying
 * Ollama response (so the caller can record token counts and timing).
 *
 * The implementer is told the file contents the planner selected. It
 * does NOT receive any other files.
 *
 * `chat` is dependency-injected so tests can stub it. The default is
 * the real Ollama client.
 */
export async function runImplementer(args: {
  model: string;
  num_ctx: number;
  task: PlannerTask;
  fileContents: string;
  chat?: typeof defaultChat;
}): Promise<{ content: string; result: OllamaChatResult }> {
  const chat = args.chat ?? defaultChat;
  const messages = [
    { role: "system" as const, content: buildImplementerSystemPrompt() },
    {
      role: "user" as const,
      content: buildImplementerUserPrompt(
        args.task.task,
        args.task.preferredOutcome,
        args.task.action,
        args.fileContents,
      ),
    },
  ];

  const result = await chat({
    model: args.model,
    messages,
    num_ctx: args.num_ctx,
    think: false,
  });

  return { content: result.content, result };
}
