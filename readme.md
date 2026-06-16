# Kufu

## Run the TUI
cd tui
cargo run

## Run the engine
cd engine
bun install
ollama run gemma4:e4b
bun run src/main.ts run pipeline --model gemma4:e4b --num-ctx 8192 --repo eval --prompt simple-prompt.md --out eval/run-001
bun run src/main.ts run single --model gemma4:e4b --num-ctx 8192 --prompt simple-prompt.md --out eval/run-001-single
