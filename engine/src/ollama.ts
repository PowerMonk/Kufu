// ollama.ts - Minimal Ollama HTTP client.
//
// One responsibility: send a non-streaming /api/chat request and return
// a flat OllamaChatResult. No retries, no streaming, no agent logic.
//
// The function is the default export so tests can stub it via DI:
//   import chat from "./ollama.ts";
//   ... { chat: fakeChat }

import type { OllamaChatResult } from "./types.ts";

export interface ChatRequest {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  num_ctx: number;
  /** Pass true to enable thinking on supported models (e.g. gemma4, qwen3). */
  think: boolean;
  /** Optional JSON schema for `format`. If provided, the model is guided to that shape. */
  format?: Record<string, unknown>;
  /** Override the Ollama base URL. Defaults to http://localhost:11434. */
  baseUrl?: string;
}

/**
 * POST /api/chat with `stream: false`. Returns the parsed result.
 * Throws on network error, non-200 response, or a response that doesn't
 * match the expected shape. We deliberately fail loud — silent fallbacks
 * are how benchmarks go wrong.
 */
export default async function chat(req: ChatRequest): Promise<OllamaChatResult> {
  const baseUrl = req.baseUrl ?? "http://localhost:11434";
  const url = `${baseUrl}/api/chat`;

  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: false,
    think: req.think,
    options: { num_ctx: req.num_ctx },
  };
  if (req.format) {
    body.format = req.format;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama HTTP ${response.status} ${response.statusText}: ${text}`);
  }

  const json: unknown = await response.json();
  if (!isOllamaResponse(json)) {
    throw new Error(`Ollama response missing expected fields: ${JSON.stringify(json).slice(0, 200)}`);
  }

  return {
    content: json.message.content ?? "",
    thinking: json.message.thinking ?? "",
    prompt_eval_count: json.prompt_eval_count ?? 0,
    eval_count: json.eval_count ?? 0,
    total_duration_ns: json.total_duration ?? 0,
  };
}

/** Type guard: a parsed JSON body that looks like an Ollama /api/chat response. */
function isOllamaResponse(value: unknown): value is {
  message: { content?: string; thinking?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
} {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.message !== "object" || v.message === null) return false;
  const m = v.message as Record<string, unknown>;
  if (typeof m.role !== "string") return false;
  return true;
}
