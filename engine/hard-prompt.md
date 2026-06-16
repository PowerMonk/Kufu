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
