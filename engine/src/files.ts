// files.ts - Read files deterministically for the implementer.
//
// The engine is the only thing that reads file contents. The implementer
// receives whatever the engine gives it and cannot request more.
//
// The format is intentionally simple so it's easy to read in a prompt:
//   --- relative/path/to/file ---
//   <contents>
//   --- end relative/path/to/file ---

import { readFile, realpath } from "node:fs/promises";
import { join, sep } from "node:path";

/** Maximum size of a single file we'll read, in bytes. */
export const MAX_FILE_BYTES = 200_000;

/** An error thrown when a required file doesn't exist or escapes the repo. */
export class FileFetchError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${message}: ${path}`);
    this.name = "FileFetchError";
  }
}

/**
 * Reads each relative path under `repoRoot` and concatenates them in a
 * stable format. Throws on the first missing or unsafe path; we never
 * silently skip, because the implementer needs to know.
 */
export async function fetchFiles(repoRoot: string, paths: string[]): Promise<string> {
  const absRoot = await realpath(repoRoot);
  const blocks: string[] = [];

  for (const p of paths) {
    if (!isSafeRelative(p)) {
      throw new FileFetchError(p, "path escapes repository or is absolute");
    }
    const abs = join(absRoot, p);
    let real: string;
    try {
      real = await realpath(abs);
    } catch {
      throw new FileFetchError(p, "required file does not exist");
    }
    // Ensure the real path is still inside the real repo root.
    if (!real.startsWith(absRoot + sep) && real !== absRoot) {
      throw new FileFetchError(p, "path resolves outside repository");
    }
    const contents = await readFile(real, "utf8");
    blocks.push(`--- ${p} ---\n${contents}\n--- end ${p} ---`);
  }

  return blocks.join("\n\n");
}

/** Returns true if `p` is a safe relative path (no absolute, no `..`). */
function isSafeRelative(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("/")) return false;
  if (/^[A-Za-z]:[\\/]/.test(p)) return false;
  // Normalize separators and disallow `..` segments.
  const norm = p.split(sep).join("/");
  const parts = norm.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") return false;
  }
  return true;
}
