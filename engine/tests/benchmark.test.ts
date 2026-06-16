// tests/benchmark.test.ts
import { expect, test } from "bun:test";
import { Benchmark, renderReport } from "../src/benchmark.ts";

test("Benchmark aggregates per-step and total metrics", () => {
  const b = new Benchmark("pipeline", "gemma4:e4b", 4096, "prompts.md");
  b.record("planner", 100, 50, 1_000_000_000);
  b.record("implementer", 200, 80, 2_000_000_000);
  const r = b.build();
  expect(r.steps).toHaveLength(2);
  expect(r.total_in_tokens).toBe(300);
  expect(r.total_out_tokens).toBe(130);
  expect(r.steps[0].duration_ms).toBe(1000);
  expect(r.steps[1].duration_ms).toBe(2000);
  expect(r.total_duration_ms).toBeGreaterThanOrEqual(0);
});

test("renderReport produces a multi-line ASCII report", () => {
  const b = new Benchmark("single", "m", 4096, "p.md");
  b.record("single", 5, 3, 1_000_000_000);
  const text = renderReport(b.build());
  expect(text).toContain("┌");
  expect(text).toContain("single");
  expect(text).toContain("in=5");
  expect(text).toContain("└");
});
