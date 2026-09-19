// Smoke tests for the eval system. Run with: bun test ./src/eval.eval.test.ts
import { test, expect } from "bun:test";
import { runEvaluation } from "./runner.ts";
import type { Cost } from "./contract.ts";

const cost: Cost = {
  input_tokens: 1000,
  output_tokens: 2000,
  total_tokens: 3000,
  duration_ms: 5000,
};

test("pipeline-quality HTML passes requirements and structural checks", async () => {
  const goodHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Kufu</title>
<style>body{background:#111;color:#eee}</style>
</head>
<body>
<header><h1>Kufu</h1><p>Local-first coding</p></header>
<main>
  <article class="role-card">Planner</article>
  <article class="role-card">Implementer</article>
  <article class="role-card">Reviewer</article>
</main>
<footer>2026</footer>
</body>
</html>`;

  const manifest = {
    task_id: "test-001",
    output_kind: "html",
    requirements: [
      { id: "hero", type: "element", selector: "header" },
      { id: "roles", type: "count", selector: "article", min: 3 },
      { id: "footer", type: "element", selector: "footer" },
      { id: "mentions_planner", type: "text", expected: "Planner" },
    ],
    layers: ["task", "structural", "quality"],
  };

  const report = await runEvaluation(manifest as any, goodHtml, cost);
  expect(report.task).toBe("test-001");
  expect(report.passed).toBe(true);
  expect(report.requirements?.passed).toBe(4);
  expect(report.requirements?.failed).toBe(0);
  expect(report.structural?.checks_total).toBe(12);
  expect(report.structural?.checks_passed).toBe(12);
  expect(report.code?.loc).toBeGreaterThan(0);
  expect(report.code?.syntax_errors).toBe(0);
});

test("structural catches missing alt and bad heading hierarchy", async () => {
  const bad = `<!DOCTYPE html>
<html><head><title>x</title></head>
<body>
  <h1>hi</h1>
  <h4>skipped h2 and h3</h4>
  <img src="x.png">
  <a>missing href</a>
</body></html>`;

  const manifest = {
    task_id: "test-002",
    output_kind: "html",
    requirements: [],
    layers: ["structural"],
  };

  const report = await runEvaluation(manifest as any, bad, cost);
  expect(report.passed).toBe(false);
  // We expect at least: missing alt, missing lang, missing viewport, missing charset, heading skip, link without href
  expect(report.structural?.checks_passed).toBeLessThan(
    report.structural?.checks_total ?? 0,
  );
  const failedIds = (report.structural?.checks ?? [])
    .filter((c: any) => !c.pass)
    .map((c: any) => c.id);
  expect(failedIds).toContain("images_have_alt");
  expect(failedIds).toContain("links_have_href");
  expect(failedIds).toContain("heading_hierarchy");
});

test("layer 1 count is recursive (matches nested articles)", async () => {
  const html = `<!DOCTYPE html><html><body>
<main><section><div><article class="role">A</article></div></section>
<section><article class="role">B</article><article class="role">C</article></section>
</main></body></html>`;

  const manifest = {
    task_id: "test-003",
    output_kind: "html",
    requirements: [
      { id: "roles", type: "count", selector: "article", min: 3 },
      { id: "by_class", type: "count", selector: ".role", min: 3 },
      { id: "by_class_or_tag", type: "count", selector: "article, .role", min: 3 },
    ],
    layers: ["task"],
  };

  const report = await runEvaluation(manifest as any, html, cost);
  expect(report.passed).toBe(true);
  expect(report.requirements?.passed).toBe(3);
});
