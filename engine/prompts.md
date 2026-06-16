# "Simple" Prompt

Create a landing page in a single HTML file with embedded CSS for an open-source project called "Kufu".

What is Kufu?: It is an experimental, local-first coding assistant that orchestrates multiple small language models to solve software engineering tasks cooperatively, rather than using a single giant cloud model.

Web Requirements:

- Modern, clean tech design with a matte dark mode. Use a soft pastel color palette (e.g., deep charcoal or slate background with muted lavender, soft sage green, or dusty rose accents). Absolutely no bright neon or flashy colors.
- Structure: A Hero section with a catchy title, a section explaining the 3 system roles (Planner, Implementer, and Reviewer), and a simple footer.
- Use semantic HTML5 and clean CSS (Flexbox or Grid). Make it fully responsive.

# "Medium" Prompt

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

# "Hard" Stress Test Prompt

Write the complete code for a high-fidelity landing page in a single HTML file using Tailwind CSS (via CDN) and basic JavaScript for interactivity. The product is "Kufu", a local-first coding assistant based on the cooperation of small, constrained language models.

You must strictly adhere to the following technical and content specifications:

1. Visual Configuration & Design Tokens:
   - Aesthetic: Soft tech, matte dark mode. No neon, no glow effects, no bright/harsh contrast.
   - Background: A deep, soft matte dark gray/blue (#1e1e2e or #181825).
   - Accent Colors: Muted pastel rose or soft coral (#f38ba8 or #f5e0dc) for highlights/status, and soft periwinkle/lavender (#b4befe) for primary elements.
   - Fonts: Sans-serif for body copy, Monospace for code snippets or technical data data.

2. Mandatory HTML Sections:
   - Navbar: Minimalist "Kufu" logo and a documentation link.
   - Hero: Main message: "Small models. Strict responsibilities. Real results." Include a clean CSS-mockup simulating a terminal user interface (TUI).
   - The Manifesto: Text blocks highlighting three pillars:
     - Human Supervision (The developer decides).
     - Deterministic Interfaces (Structured JSON communication, no natural language between agents).
     - Tiny Tasks (Small context windows are a feature, not a bug).
   - Event Simulator (Interactive JS Section): A container simulating the Engine's IPC communication. When clicking a "Simulate Pipeline" button, it must sequentially display the following JSON payloads inside a simulated terminal screen with a short delay between each:
     {"event": "PLANNER_STARTED"}
     {"event": "IMPLEMENTER_WORKING"}
     {"event": "REVIEWER_FINISHED", "verdict": "ACCEPTED"}

3. Local Model Constraints:
   - Do not use external image files (use native inline SVGs or clean layout design instead).
   - All CSS and JS must be completely self-contained within the file.
   - Ensure all HTML tags are properly closed and indentation is immaculate. Do not skip sections with placeholders like "<!-- code goes here -->". Write the entire implementation.
