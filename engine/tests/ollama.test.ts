// tests/ollama.test.ts
import { expect, test, mock } from "bun:test";

import chat from "../src/ollama.ts";

test("chat() sends model, messages, num_ctx, think, format", async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const fakeFetch = mock(async (url: string, init: RequestInit) => {
    captured = { url, init };
    return new Response(
      JSON.stringify({
        model: "m",
        created_at: "now",
        message: { role: "assistant", content: "hi", thinking: "thought" },
        done_reason: "stop",
        done: true,
        total_duration: 1_000_000_000,
        prompt_eval_count: 12,
        eval_count: 4,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  globalThis.fetch = fakeFetch as unknown as typeof fetch;

  const res = await chat({
    model: "gemma4:e4b",
    messages: [{ role: "user", content: "hello" }],
    num_ctx: 4096,
    think: true,
    format: { type: "object" },
    baseUrl: "http://example:1234",
  });

  expect(captured).not.toBeNull();
  expect(captured!.url).toBe("http://example:1234/api/chat");
  const body = JSON.parse(captured!.init.body as string);
  expect(body.model).toBe("gemma4:e4b");
  expect(body.think).toBe(true);
  expect(body.stream).toBe(false);
  expect(body.options.num_ctx).toBe(4096);
  expect(body.format).toEqual({ type: "object" });

  expect(res.content).toBe("hi");
  expect(res.thinking).toBe("thought");
  expect(res.prompt_eval_count).toBe(12);
  expect(res.eval_count).toBe(4);
  expect(res.total_duration_ns).toBe(1_000_000_000);
});

test("chat() throws on non-200 response", async () => {
  const fakeFetch = mock(async () => new Response("oops", { status: 500 }));
  globalThis.fetch = fakeFetch as unknown as typeof fetch;

  expect(
    chat({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      num_ctx: 1024,
      think: false,
    }),
  ).rejects.toThrow(/HTTP 500/);
});

test("chat() throws on malformed response", async () => {
  const fakeFetch = mock(async () => new Response(JSON.stringify({ message: null }), { headers: { "Content-Type": "application/json" } }));
  globalThis.fetch = fakeFetch as unknown as typeof fetch;

  expect(
    chat({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      num_ctx: 1024,
      think: false,
    }),
  ).rejects.toThrow();
});
