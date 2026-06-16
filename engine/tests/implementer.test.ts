// tests/implementer.test.ts
import { expect, test } from "bun:test";
import { runImplementer } from "../src/implementer.ts";
import type { OllamaChatResult } from "../src/types.ts";

function fakeChat(respondWith: string): (req: unknown) => Promise<OllamaChatResult> {
  return async (): Promise<OllamaChatResult> => ({
    content: respondWith,
    thinking: "",
    prompt_eval_count: 50,
    eval_count: 200,
    total_duration_ns: 1_000_000_000,
  });
}

test("runImplementer returns the raw content and metrics", async () => {
  const fake = fakeChat("<html>hello</html>");
  const { content, result } = await runImplementer({
    model: "m",
    num_ctx: 4096,
    task: {
      id: "t",
      task: "Make a page",
      preferredOutcome: "index.html",
      requiredFiles: [],
      action: "CREATE",
    },
    fileContents: "",
    chat: fake as never,
  });
  expect(content).toBe("<html>hello</html>");
  expect(result.eval_count).toBe(200);
});
