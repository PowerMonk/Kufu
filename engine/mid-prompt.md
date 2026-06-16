Act as a Senior Frontend Designer. Create a landing page in a single file (HTML with Tailwind CSS via CDN) for a new local-first development framework called "Kufu".

The project's philosophy is: "Complexity should come from system design, not from larger prompts." We don't compete with the cloud; we prove that small local models cooperating through strict interfaces are highly efficient.

Required Layout & Structure:

1. Hero Section: Striking title ("Kufu: Local-First Multi-Agent Coding"), a subtitle explaining the small model orchestration, and a "View on GitHub" button.
2. Architecture (The Stack): A clean section showing the core breakdown:
   - TUI (Terminal User Interface): Written in Rust.
   - Engine (Orchestrator): Written in TypeScript.
   - Communication: Ultra-lightweight IPC via JSON messages.
3. The Pipeline (How it works): A simple, clean visual flow (using cards, subtle borders, or soft lines) explaining the process: User -> Planner (Plans) -> Implementer (Writes code) -> Reviewer (Validates) -> Human (Decides).
4. Visual Style: Matte dark mode (e.g., bg-zinc-900 or bg-slate-900). Use monospace typography for technical details. Use a refined, muted pastel color scheme for accents (like soft indigo/lavander, muted teal, or cream). Avoid harsh neon or overly vibrant glowing effects.

Deliver only the complete, functional HTML/CSS code inside a single code block.
