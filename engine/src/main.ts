// main.ts - CLI entrypoint.
//
// Usage:
//   bun run src/main.ts run pipeline --model gemma4:e4b --num-ctx 8192 \
//       --repo eval --prompt simple-prompt.md --out eval/run-001
//   bun run src/main.ts run single --model gemma4:e4b --num-ctx 8192 \
//       --prompt simple-prompt.md --out eval/run-001-single
//   bun run src/main.ts run single --model gemma4:e4b --num-ctx 8192 \
//       --prompt simple-prompt.md --out eval/run-001-single --thinking

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import chat from "./ollama.ts";
import { runPipeline } from "./pipeline.ts";
import { runSingle } from "./single.ts";
import { renderReport } from "./benchmark.ts";

interface Args {
  command: "run";
  subcommand: "pipeline" | "single";
  model: string;
  num_ctx: number;
  prompt: string;
  repo?: string;
  out: string;
  thinking?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  if (args[0] !== "run" || (args[1] !== "pipeline" && args[1] !== "single")) {
    usage();
  }
  const subcommand = args[1] as "pipeline" | "single";

  const map = new Map<string, string | boolean>();
  let i = 2;
  while (i < args.length) {
    const key = args[i];
    if (!key.startsWith("--")) usage();
    
    // Check if this is a boolean flag (no value, or next arg is another flag)
    const nextArg = args[i + 1];
    if (nextArg === undefined || nextArg.startsWith("--")) {
      // Boolean flag
      map.set(key, true);
      i += 1;
    } else {
      // Flag with value
      map.set(key, nextArg);
      i += 2;
    }
  }

  const model = map.get("--model") as string | undefined;
  const num_ctx = map.get("--num-ctx") as string | undefined;
  const prompt = map.get("--prompt") as string | undefined;
  const out = map.get("--out") as string | undefined;
  if (!model || !num_ctx || !prompt || !out) usage();

  const num = Number(num_ctx);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`--num-ctx must be a positive integer, got ${num_ctx}`);
  }

  const result: Args = {
    command: "run",
    subcommand,
    model,
    num_ctx: num,
    prompt,
    out,
  };
  const repo = map.get("--repo") as string | undefined;
  if (repo) result.repo = repo;
  if (subcommand === "pipeline" && !result.repo) {
    throw new Error("--repo is required for the pipeline subcommand");
  }
  
  // Handle --thinking flag (boolean, only for single subcommand)
  const thinking = map.get("--thinking");
  if (thinking === true) {
    if (subcommand !== "single") {
      throw new Error("--thinking is only supported for the single subcommand");
    }
    result.thinking = true;
  }
  
  return result;
}

function usage(): never {
  console.error(
    "Usage:\n" +
      "  bun run src/main.ts run pipeline --model M --num-ctx N --repo R --prompt P --out O\n" +
      "  bun run src/main.ts run single   --model M --num-ctx N --prompt P --out O [--thinking]",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const promptPath = resolve(args.prompt);
  const promptText = await readFile(promptPath, "utf8");
  const promptFile = promptPath;

  if (args.subcommand === "single") {
    const { record } = await runSingle({
      model: args.model,
      num_ctx: args.num_ctx,
      promptText,
      promptFile,
      outDir: args.out,
      chat,
      thinking: args.thinking,
    });
    console.log(renderReport(record));
  } else {
    const { record } = await runPipeline({
      model: args.model,
      num_ctx: args.num_ctx,
      repo: args.repo!,
      promptText,
      promptFile,
      outDir: args.out,
      chat,
    });
    console.log(renderReport(record));
  }
}

main().catch((err) => {
  console.error(err.stack ?? err.message ?? String(err));
  process.exit(1);
});
