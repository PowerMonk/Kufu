// eval/runner.ts - Orchestrates evaluator layers and produces EvalReport.
//
// Entry point: `runEvaluation(manifest, output, cost)`.
//   - `output` is the implementer's full file content (HTML, CSS, TS, ...).
//   - `cost` comes from the existing `BenchmarkRecord` so we don't
//     double-count tokens.
//
// Layers run in declared order. By default we run all layers that
// apply to `manifest.output_kind`. Today: all of (task, structural,
// quality) work for HTML; only `task` and `quality` apply to JSON
// (structural is HTML-specific). The runner is extensible: add new
// layers by extending the dispatch table below.

import type {
  EvalReport,
  Cost,
} from "./contract.ts";
import type { TaskManifest, LayerName } from "./task.ts";
import { evaluateTask } from "./layers/task.ts";
import { evaluateStructural } from "./layers/structural.ts";
import { evaluateQuality } from "./layers/quality.ts";

export async function runEvaluation(
  manifest: TaskManifest,
  output: string,
  cost: Cost,
): Promise<EvalReport> {
  const requested: LayerName[] = manifest.layers ?? defaultLayers(manifest);

  let passed = true;
  let requirements: EvalReport["requirements"];
  let structural: EvalReport["structural"];
  let code: EvalReport["code"];

  if (requested.includes("task")) {
    const r = evaluateTask(output, manifest);
    requirements = { passed: r.passed, failed: r.failed, total: r.total };
    if (r.failed > 0) passed = false;
  }

  if (requested.includes("structural") && manifest.output_kind === "html") {
    const r = evaluateStructural(output);
    structural = r;
    if (r.checks_total - r.checks_passed > 0) passed = false;
  }

  if (requested.includes("quality")) {
    const r = evaluateQuality(output);
    code = r;
    if (r.syntax_errors > 0 || r.broken_imports > 0) passed = false;
  }

  return {
    task: manifest.task_id,
    passed,
    output_kind: manifest.output_kind,
    requirements,
    structural,
    code,
    cost,
    timestamp: new Date().toISOString(),
  };
}

function defaultLayers(manifest: TaskManifest): LayerName[] {
  const layers: LayerName[] = ["task", "quality"];
  if (manifest.output_kind === "html" || manifest.output_kind === "css") {
    layers.push("structural");
  }
  return layers;
}
