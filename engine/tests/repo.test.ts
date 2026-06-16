// tests/repo.test.ts
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { walkRepo } from "../src/repo.ts";

async function makeFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "kufu-repo-"));
  await writeFile(join(root, "a.txt"), "a");
  await writeFile(join(root, "b.txt"), "b");
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "main.ts"), "export {};");
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules", "skip.js"), "// skip me");
  await mkdir(join(root, ".git"));
  await writeFile(join(root, ".git", "skip"), "skip");
  return root;
}

test("walkRepo returns sorted relative paths and skips heavy dirs", async () => {
  const root = await makeFixture();
  try {
    const { files } = await walkRepo(root);
    expect(files).toEqual(["a.txt", "b.txt", "src/main.ts"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("walkRepo is deterministic across calls", async () => {
  const root = await makeFixture();
  try {
    const a = await walkRepo(root);
    const b = await walkRepo(root);
    expect(a.files).toEqual(b.files);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("walkRepo throws if root is not a directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "kufu-repo-"));
  const file = join(root, "not-a-dir.txt");
  await writeFile(file, "x");
  try {
    expect(walkRepo(file)).rejects.toThrow(/not a directory/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
