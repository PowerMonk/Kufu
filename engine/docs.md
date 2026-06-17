# Kufu Engine Documentation

## Purpose

The Kufu Engine is a research tool for evaluating whether a "agent"-step pipeline (planner → implementer) produces better code than a single LLM call. It orchestrates local language models via Ollama and measures token usage, latency, and output quality.

The core hypothesis: Can a small Planner select enough context for a small Implementer to consistently solve simple tasks?

## Architecture

The engine has two modes:

**Pipeline mode**: Two LLM calls in sequence.

1. Planner receives the user prompt and a list of available files (names only, not contents). It outputs a structured JSON task specifying which file to create/update/delete and which files the implementer should read.
2. Implementer receives the planner's task and the contents of the files the planner selected. It outputs the complete updated target file.

**Single mode**: One LLM call. The model receives only the user prompt and generates code directly.

Both modes record token counts (input/output), latency, and write artifacts to disk for later analysis.

## Results

### Run 001 (2026-06-15)

First attempt with the initial schema. The planner produced a malformed task:

- `id` field contained a file path instead of a uuid
- `task` field contained the action verb "UPDATE" instead of a description
- `requiredFiles` included the file being overwritten

The implementer received no actionable instruction and returned the input file unchanged. The single run produced a complete 200-line landing page.

**Conclusion**: The schema was too permissive. The model took the path of least resistance.

### Run 002 (2026-06-15)

Schema tightened:

- Removed `id` field (unused, caused confusion)
- Added `min(20)` constraint to `task` field (forced descriptive instructions)

Results:

- **Pipeline**: 1,615 input tokens, 2,476 output tokens, 89s latency. Produced a production-ready landing page with semantic HTML, CSS custom properties, responsive grid, and hover effects.
- **Single**: 192 input tokens, 2,220 output tokens, 50s latency. Produced a functional but generic landing page with less polished CSS.
- **Single with thinking**: 199 input tokens, 2,937 output tokens, 83s latency. Produced verbose descriptions but worse code than the non-thinking single run.

**Conclusion**: The pipeline produced better code despite 8× more input tokens and 70% longer latency. The implementer's advantage was having existing files as reference and a specific task description from the planner.

**Issue discovered**: The planner's thinking trace mentioned `styles.css` would be useful, but the actual JSON output had `requiredFiles: []`. The model's reasoning doesn't consistently match its structured output.

## Code Structure

```
engine/
├── src/
│   ├── main.ts          CLI entrypoint, argument parsing
│   ├── pipeline.ts      Orchestrates planner → implementer
│   ├── single.ts        Single-model baseline run
│   ├── planner.ts       Runs planner, validates output
│   ├── implementer.ts   Runs implementer
│   ├── ollama.ts        HTTP client for Ollama API
│   ├── schema.ts        Zod schemas for PlannerTask
│   ├── prompts.ts       System and user prompt builders
│   ├── repo.ts          Walks repository, lists files
│   ├── files.ts         Reads file contents
│   ├── benchmark.ts     Records token counts and latency
│   └── types.ts         Shared TypeScript interfaces
├── eval/
│   ├── seed/            Mock files for testing (index.html, readme.md, styles.css)
│   └── run-*/           Output directories from runs
└── logs/
    └── run-*.md         Analysis of each run
```

## CLI Usage

### Pipeline mode

```bash
bun run src/main.ts run pipeline \
  --model gemma4:e4b \
  --num-ctx 8192 \
  --repo eval/seed \
  --prompt simple-prompt.md \
  --out eval/run-001
```

**Arguments**:

- `--model`: Ollama model name (e.g., `gemma4:e4b`, `qwen3:8b`)
- `--num-ctx`: Context window size in tokens (e.g., `4096`, `8192`, `16384`)
- `--repo`: Directory containing files the planner can see (names only)
- `--prompt`: Path to the user prompt file
- `--out`: Directory where artifacts will be written

**Output**:

- `planner.json`: Planner's task and thinking trace
- `implementer.txt`: Implementer's generated code
- `report.json`: Token counts and latency
- `report.txt`: Human-readable summary

### Single mode

```bash
bun run src/main.ts run single \
  --model gemma4:e4b \
  --num-ctx 8192 \
  --prompt simple-prompt.md \
  --out eval/run-001-single
```

**Arguments**: Same as pipeline mode, minus `--repo`.

**Optional flag**:

- `--thinking`: Enable thinking mode (model reasons before generating). Saves thinking trace to `thinking.txt`.

**Output**:

- `single.txt`: Generated code
- `thinking.txt`: Thinking trace (only if `--thinking` is used)
- `report.json`: Token counts and latency
- `report.txt`: Human-readable summary

## Data Flow

### Pipeline mode

1. `repo.ts` walks the `--repo` directory and returns a list of file names (no contents).
2. `planner.ts` sends the file list and user prompt to the model with `think: true` and a JSON schema constraint. The model outputs a `PlannerTask`.
3. `schema.ts` validates the task with Zod. If validation fails, the run aborts.
4. `files.ts` reads the contents of files listed in `requiredFiles`.
5. `implementer.ts` sends the task and file contents to the model with `think: false`. The model outputs code.
6. `benchmark.ts` records token counts and latency from both calls.
7. `main.ts` writes all artifacts to `--out`.

### Single mode

1. `single.ts` sends the user prompt to the model with `think: false` (or `true` if `--thinking` is used).
2. `benchmark.ts` records token counts and latency.
3. `main.ts` writes artifacts to `--out`.

## Key Design Decisions

**Planner sees file names, not contents**: This forces the planner to reason about structure and dependencies without getting lost in implementation details. It also keeps the planner's context small.

**Implementer sees file contents**: The implementer needs the actual code to make informed changes. The planner decides which files are relevant; the implementer reads them.

**Planner has thinking enabled, implementer does not**: The planner needs to reason about task decomposition. The implementer just needs to execute. Thinking on the implementer produced worse code in run-002.

**Schema validation with Zod**: The planner's output is validated before being passed to the implementer. If the planner produces malformed JSON or violates constraints, the run fails early instead of propagating bad data.

**No retries or fallbacks**: If a step fails, the run aborts. This makes debugging easier and prevents silent failures from corrupting benchmarks.

## Known Issues

**Planner thinking/output mismatch**: The planner's thinking trace sometimes contradicts its JSON output. For example, in run-002, the thinking mentioned `styles.css` would be useful, but `requiredFiles` was empty. This is a model limitation, not a schema problem.

**Token overhead**: The pipeline uses 8× more input tokens than single mode. For small models with limited context, this overhead may not be worth the quality improvement.

**No output validation**: The implementer's output is not validated (e.g., checking if it's valid HTML). Bad output is written to disk and must be caught during manual review.

## Future Work

- **Larger context windows**: Test with `num_ctx: 16384` to see if the planner's thinking becomes more consistent with its output.
- **Better models**: Compare `gemma4:e4b` with `qwen3:8b` and `llama3.1:8b` to see if the pipeline advantage holds.
- **Output validation**: Add HTML/CSS validation for the implementer's output.
- **Multi-file tasks**: Extend the schema to support tasks that modify multiple files.
- **Reviewer agent**: Add a third step that validates the implementer's output against the planner's task.
