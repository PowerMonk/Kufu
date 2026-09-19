// eval/layers/structural.ts - Layer 2 dispatcher.
//
// Runs every HTML check from `eval/checks/html.ts`, aggregates into a
// StructuralResult. A subset of failures count as accessibility_issues
// so the EvalReport surfaces them under the `a11y` slot in your
// example JSON.

import type {
  StructuralResult,
  CheckResult,
} from "../contract.ts";
import { HTML_CHECKS } from "../checks/html.ts";

const A11Y_CHECK_IDS = new Set([
  "images_have_alt",
  "buttons_not_divs",
  "no_inline_event_handlers",
  "has_html_lang",
]);

export function evaluateStructural(output: string): StructuralResult {
  const checks: CheckResult[] = HTML_CHECKS.map((fn) => fn(output));
  let passed = 0;
  let failed = 0;
  let htmlErrors = 0;
  let a11yIssues = 0;

  for (const c of checks) {
    if (c.pass) {
      passed++;
    } else {
      failed++;
      if (A11Y_CHECK_IDS.has(c.id)) a11yIssues++;
      else htmlErrors++;
    }
  }

  return {
    layer: "structural",
    html_errors: htmlErrors,
    accessibility_issues: a11yIssues,
    checks_passed: passed,
    checks_total: checks.length,
    checks,
  };
}
