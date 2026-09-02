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
  /**
   * How long Ollama should keep this model loaded in memory after the request.
   *   - `number`: seconds (e.g. 300, 0)
   *   - `string`: duration like "10m", "1h" (Ollama parses this)
   *   - `-1`: keep loaded indefinitely (until the next unload request)
   *   - `0`: unload immediately after the request finishes
   * If undefined, Ollama uses its 5-minute default.
   */
  keep_alive?: number | string;
  /**
   * Random seed for reproducible sampling. When set, Ollama should
   * produce identical outputs for identical inputs. When undefined,
   * Ollama uses its own (typically time-based) seed and outputs vary.
   */
  seed?: number;
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
  if (req.keep_alive !== undefined) {
    body.keep_alive = req.keep_alive;
  }
  if (req.seed !== undefined) {
    (body.options as Record<string, unknown>).seed = req.seed;
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

/** A model currently loaded in Ollama memory (from GET /api/ps). */
export interface LoadedModel {
  name: string;
  size_vram: number;
  expires_at: string;
}

/**
 * Lists models currently loaded in Ollama memory. Used by the engine
 * to report VRAM state in the usage ledger and by callers that want to
 * confirm a model is resident before issuing another request.
 */
export async function listLoadedModels(baseUrl?: string): Promise<LoadedModel[]> {
  const url = `${baseUrl ?? "http://localhost:11434"}/api/ps`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ollama /api/ps HTTP ${response.status} ${response.statusText}`);
  }
  const json: unknown = await response.json();
  if (typeof json !== "object" || json === null) return [];
  const v = json as { models?: unknown };
  if (!Array.isArray(v.models)) return [];
  const out: LoadedModel[] = [];
  for (const m of v.models) {
    if (typeof m !== "object" || m === null) continue;
    const mm = m as Record<string, unknown>;
    if (typeof mm.name !== "string") continue;
    out.push({
      name: mm.name,
      size_vram: typeof mm.size_vram === "number" ? mm.size_vram : 0,
      expires_at: typeof mm.expires_at === "string" ? mm.expires_at : "",
    });
  }
  return out;
}

/**
 * Unloads `model` from Ollama memory. Uses the documented trick:
 *   POST /api/generate with an empty prompt and keep_alive=0.
 * Ollama responds with `done_reason: "unload"`. We don't care about the
 * body — if the call succeeds, the model is no longer resident.
 *
 * Best-effort by design: a failed unload should never mask a successful run.
 */
export async function unloadModel(model: string, baseUrl?: string): Promise<void> {
  const url = `${baseUrl ?? "http://localhost:11434"}/api/generate`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: "",
      keep_alive: 0,
      stream: false,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama unload HTTP ${response.status} ${response.statusText}: ${text}`);
  }
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
