// eval/layers/quality.ts - Layer 3 dispatcher.
//
// Counts basic code-quality metrics. Stub: most fields are populated,
// `broken_imports` and `unused_symbols` are zero placeholders for now.
// `syntax_errors` is computed by trying to parse the output as HTML
// via htmlparser2; if it throws, count = 1. We can extend with
// real TS lint / CSS lint later by adding checks to `eval/checks/`.

import { parseDocument } from "htmlparser2";

import type { CodeQualityResult } from "../contract.ts";
import { countLoc, countHtmlAssets } from "../checks/general.ts";

export function evaluateQuality(output: string): CodeQualityResult {
  const loc = countLoc(output);
  const asset_count = countHtmlAssets(output);

  let syntax_errors = 0;
  try {
    // parseDocument is forgiving; only a fully-blown tokenizer error
    // (e.g. unbalanced entities) raises. For robust syntax detection
    // we'd need a strict parser; this is a smoke test.
    parseDocument(output);
  } catch {
    syntax_errors = 1;
  }

  return {
    layer: "quality",
    loc,
    file_count: 1,
    asset_count,
    broken_imports: 0,
    syntax_errors,
    unused_symbols: 0,
  };
}
