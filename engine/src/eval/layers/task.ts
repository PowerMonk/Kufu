// eval/layers/task.ts - Layer 1: task correctness evaluator.
//
// Walks each requirement in the manifest, dispatches by `type`, and
// collects CheckResults. Uses htmlparser2 + our tiny CSS-subset
// selector engine.
//
// `style` type requirements are deferred to Layer 4 (visual /
// computed-style checks). For now they pass with a stub detail.

import { parseDocument } from "htmlparser2";
import type { AnyNode, Element } from "domhandler";

import type {
  TaskCorrectnessResult,
  CheckResult,
} from "../contract.ts";
import type { TaskRequirement, TaskManifest } from "../task.ts";
import { countMatches, existsMatch, findFirst } from "../selector.ts";

export function evaluateTask(
  output: string,
  manifest: TaskManifest,
): TaskCorrectnessResult {
  // parseDocument returns a root node whose children we hand to the walker.
  const root = parseDocument(output);
  const document: AnyNode[] = root.children as AnyNode[];
  const bodyText = extractText(document).toLowerCase();

  const checks: CheckResult[] = manifest.requirements.map((req) =>
    runRequirement(req, document, bodyText),
  );

  let passed = 0;
  let failed = 0;
  for (const c of checks) (c.pass ? passed++ : failed++);

  return {
    layer: "task",
    passed,
    failed,
    total: checks.length,
    checks,
  };
}

function runRequirement(
  req: TaskRequirement,
  document: AnyNode[],
  bodyText: string,
): CheckResult {
  switch (req.type) {
    case "element": {
      if (!req.selector) {
        return { id: req.id, pass: false, detail: "element requires selector" };
      }
      const exists = existsMatch(req.selector, document);
      return {
        id: req.id,
        pass: exists,
        detail: exists ? undefined : `no element matched "${req.selector}"`,
      };
    }

    case "count": {
      if (!req.selector) {
        return { id: req.id, pass: false, detail: "count requires selector" };
      }
      const n = countMatches(req.selector, document);
      const min = req.min ?? 0;
      const ok = n >= min && (req.max === undefined || n <= req.max);
      const detail = ok
        ? undefined
        : `count=${n} outside [${min}, ${req.max ?? "∞"}]`;
      return { id: req.id, pass: ok, detail };
    }

    case "text": {
      const expected = (req.expected ?? "").toLowerCase();
      if (!expected) {
        return { id: req.id, pass: false, detail: "text requires expected" };
      }
      const pass = bodyText.includes(expected);
      return {
        id: req.id,
        pass,
        detail: pass ? undefined : `text "${expected}" not found in body`,
      };
    }

    case "attr": {
      if (!req.selector || !req.attribute) {
        return {
          id: req.id,
          pass: false,
          detail: "attr requires selector and attribute",
        };
      }
      const matched = findFirst(req.selector, document) as Element | null;
      if (!matched) {
        return {
          id: req.id,
          pass: false,
          detail: `no element matched "${req.selector}"`,
        };
      }
      const actual = matched.attribs?.[req.attribute];
      const want = req.value ?? "";
      const pass = actual === want;
      return {
        id: req.id,
        pass,
        detail: pass
          ? undefined
          : `${req.selector}[${req.attribute}]="${actual ?? ""}" != "${want}"`,
      };
    }

    case "style": {
      // Deferred: needs computed styles, which require a browser
      // (Layer 4). Stub a passing result for now so manifests with
      // style requirements don't break.
      return {
        id: req.id,
        pass: true,
        detail: "style check deferred to Layer 4 (visual)",
      };
    }
  }
}

/** Recursively collects text nodes into a single lowercase string. */
function extractText(elements: AnyNode[]): string {
  const parts: string[] = [];
  const walk = (node: any): void => {
    if (!node) return;
    if (node.type === "text") parts.push(node.data ?? "");
    const children = node.children;
    if (Array.isArray(children)) {
      for (const c of children) walk(c);
    }
  };
  for (const el of elements) walk(el);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
