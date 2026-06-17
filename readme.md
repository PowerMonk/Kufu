# Kufu

## Run the TUI

```bash
cd tui
cargo run
```

## Run the engine

```bash
cd engine
```

```bash
bun install
```

```bash
ollama run gemma4:e4b
```

```bash
bun run src/main.ts run pipeline --model gemma4:e4b --num-ctx 8192 --repo eval/seed --prompt simple-prompt.md --out eval/run-001
```

```bash
bun run src/main.ts run single --model gemma4:e4b --num-ctx 8192 --prompt simple-prompt.md --out eval/run-001-single
```
