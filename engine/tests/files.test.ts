// tests/files.test.ts
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fetchFiles, FileFetchError } from "../src/files.ts";

test("fetchFiles reads and concatenates in the documented format", async () => {
  const root = await mkdtemp(join(tmpdir(), "kufu-files-"));
  try {
    await writeFile(join(root, "a.txt"), "alpha");
    await writeFile(join(root, "b.txt"), "beta");
    const out = await fetchFiles(root, ["a.txt", "b.txt"]);
    expect(out).toContain("--- a.txt ---\nalpha\n--- end a.txt ---");
    expect(out).toContain("--- b.txt ---\nbeta\n--- end b.txt ---");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fetchFiles throws on missing file", async () => {
  const root = await mkdtemp(join(tmpdir(), "kufu-files-"));
  try {
    await writeFile(join(root, "exists.txt"), "ok");
    expect(fetchFiles(root, ["missing.txt"])).rejects.toBeInstanceOf(FileFetchError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fetchFiles rejects paths that escape the repo", async () => {
  const root = await mkdtemp(join(tmpdir(), "kufu-files-"));
  try {
    expect(fetchFiles(root, ["../etc/passwd"])).rejects.toBeInstanceOf(FileFetchError);
    expect(fetchFiles(root, ["/absolute/path"])).rejects.toBeInstanceOf(FileFetchError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fetchFiles returns empty string for an empty list", async () => {
  const root = await mkdtemp(join(tmpdir(), "kufu-files-"));
  try {
    const out = await fetchFiles(root, []);
    expect(out).toBe("");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
