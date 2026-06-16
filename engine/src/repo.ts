// repo.ts - Deterministic repository walker.
//
// Lists every file under a root directory as POSIX-style relative paths
// ("src/main.rs", not "src\\main.rs"). Excludes heavy/build directories
// and very large files. Output is sorted so the order is stable across
// runs, which matters for benchmark reproducibility.

import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/** Directories we never descend into. */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "target",   // Rust build
  "dist",     // TypeScript build
  "build",
  ".next",
  ".cache",
  ".turbo",
  ".venv",
  "__pycache__",
]);

/** Files larger than this are skipped (no binaries, no generated bundles). */
const MAX_FILE_BYTES = 1_000_000;

/** Hidden files/dirs (starting with `.`) are skipped by default. */
const SKIP_HIDDEN = true;

/** Result of walking a repository. */
export interface WalkResult {
  /** All relative paths, sorted, POSIX-style, no leading "./". */
  files: string[];
}

/**
 * Walks `root` breadth-first and returns a sorted list of relative file paths.
 * Throws if `root` doesn't exist or isn't a directory.
 */
export async function walkRepo(root: string): Promise<WalkResult> {
  const absRoot = toAbsolute(root);
  const rootStat = await stat(absRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`walkRepo: not a directory: ${absRoot}`);
  }

  const out: string[] = [];
  await walkInto(absRoot, absRoot, out);
  out.sort();
  return { files: out };
}

async function walkInto(
  absRoot: string,
  current: string,
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    // Permission errors etc. — skip this directory silently.
    return;
  }

  // Sort entries so the traversal itself is deterministic.
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const name = entry.name;
    if (SKIP_HIDDEN && name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      await walkInto(absRoot, join(current, name), out);
      continue;
    }
    if (!entry.isFile()) continue;

    const abs = join(current, name);
    let info;
    try {
      info = await stat(abs);
    } catch {
      continue;
    }
    if (info.size > MAX_FILE_BYTES) continue;

    const rel = relative(absRoot, abs).split(sep).join("/");
    out.push(rel);
  }
}

/** Resolves a path to an absolute one. */
function toAbsolute(p: string): string {
  // `node:path` doesn't have a `isAbsolute` that handles Windows cleanly
  // in a cross-platform way without a process reference. We use a simple
  // check: starts with "/" (POSIX) or a drive letter (Windows).
  if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) return p;
  return join(process.cwd(), p);
}
