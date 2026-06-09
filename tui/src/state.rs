// state.rs - Application state.
//
// RESPONSIBILITY: Hold the data the TUI needs to render a frame. This is the
// "model" in a model/view setup. It contains no rendering code, no terminal
// code, and no event-handling code.
//
// WHY A SEPARATE FILE?
// `main.rs` should only run the terminal loop. Keeping `AppState` in its own
// module makes both files easier to read.

use crate::text_input::TextInput;

/// Information about the language model currently configured.
/// For now these are placeholders; later the engine will send them over IPC.
pub struct ModelInfo {
    pub name: String,
    pub context_window: String,
}

/// Everything the UI needs to draw a single frame.
pub struct AppState {
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
            input: TextInput::new(),
            model: ModelInfo {
                name: "Magistral 24b".to_string(),
                context_window: "128k".to_string(),
            },
            should_quit: false,
        }
    }
}
