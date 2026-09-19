// eval/checks/general.ts - Language-agnostic code-quality heuristics.
//
// Counters only. They're stable numbers that compose into the
// `CodeQualityResult` and let us spot regressions across runs.

export interface CodeMetrics {
  loc: number;
  file_count: number;
  asset_count: number;
  broken_imports: number;
}

/**
 * Counts lines of code (non-empty, non-comment-only) for a single string.
 * Heuristic: drop blank lines and lines whose first non-whitespace char
 * is `//` or `#`. Good enough for first-pass metrics; not a lexer.
 */
export function countLoc(content: string): number {
  let n = 0;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("/*") || trimmed.startsWith("<!--")) continue;
    n++;
  }
  return n;
}

/**
 * Counts assets referenced from a single HTML blob:
 *   - <img src="..."> not pointing to a CDN (no http/https)
 *   - <link href="..."> not pointing to a CDN
 *   - <script src="..."> not pointing to a CDN
 * Inline <style> and inline <script> don't count (they're part of the file).
 */
export function countHtmlAssets(content: string): number {
  const cdnRe = /^(https?:)?\/\//i;
  const isLocal = (u: string) => u.length > 0 && !cdnRe.test(u);
  let n = 0;
  for (const re of [
    /<img\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi,
    /<link\b[^>]*\bhref\s*=\s*"([^"]+)"/gi,
    /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi,
  ]) {
    for (const m of content.matchAll(re)) {
      if (isLocal(m[1])) n++;
    }
  }
  return n;
}
