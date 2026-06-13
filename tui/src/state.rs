// state.rs - Application state.
//
// RESPONSIBILITY: Hold the data the TUI needs to render a frame. This is
// the "model" in a model/view setup. It contains no rendering code, no
// terminal code, and no event-handling code.
//
// WHY A SEPARATE FILE?
// `main.rs` should only run the terminal loop. Keeping `AppState` in its
// own module makes both files easier to read.

use crate::text_input::TextInput;

/// Information about the language model currently configured.
/// For now these are placeholders; later the engine will send them over IPC.
pub struct ModelInfo {
    pub name: String,
    pub context_window: String,
}

/// Which "page" of the UI is currently active.
///
/// A page is one full screen of the TUI. The TUI starts with the prompt
/// page. Future pages could be a help screen, a settings screen, etc.
///
/// This is intentionally an enum (not a trait) for now. When we have a
/// second page, we can either add more variants or upgrade to a trait —
/// whichever feels simpler. The point of having it at all is that the
/// main loop and the key dispatch already have a place to switch on
/// `mode`, so adding a new page is a small change.
///
/// In C# terms: this is the equivalent of a `MainWindow` that hosts
/// different `UserControl` children, with a switch on `ActiveChild`.
pub enum AppMode {
    /// The default: a prompt input box in the middle of the screen.
    Prompt,
}

/// Everything the UI needs to draw a single frame.
pub struct AppState {
    /// Which page is currently active.
    /// The only variant today is `AppMode::Prompt`, so this field is
    /// currently set but not branched on. It exists so the next page
    /// (`Help`, `Settings`, ...) has an obvious place to live.
    #[allow(dead_code)]
    pub mode: AppMode,
    /// The textbox state.
    pub input: TextInput,
    /// Which model is currently selected.
    pub model: ModelInfo,
    /// Set to `true` when the user asks to quit.
    pub should_quit: bool,
}

impl AppState {
    /// Creates the initial state for a fresh app.
    pub fn new() -> Self {
        // These values are placeholders so the UI has something to show.
        // The real values will come from the engine later.
        Self {
            mode: AppMode::Prompt,
            input: TextInput::new(),
            model: ModelInfo {
                name: "Magistral 24b".to_string(),
                context_window: "128k".to_string(),
            },
            should_quit: false,
        }
    }
}
