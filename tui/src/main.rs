// main.rs - Kufu TUI entry point.
//
// RESPONSIBILITY: This file ONLY does three things:
//   1. Set up the terminal (raw mode, alternate screen).
//   2. Run the event loop: draw, read input, update state, repeat.
//   3. Tear the terminal down cleanly on exit.
//
// Everything else lives in its own module:
//   - `state`       holds the app's data
//   - `text_input`  owns the textbox logic
//   - `ui`          draws widgets
//   - `theme`       defines colors

mod state;
mod text_input;
mod theme;
mod ui;

use std::io;

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use crossterm::execute;
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen};
use ratatui::{backend::CrosstermBackend, Terminal};

use crate::state::AppState;
use crate::ui::widgets::TextInputView;

fn main() -> io::Result<()> {
    // 1. Terminal setup. We do this in three steps so a single failure still
    //    leaves the terminal in a usable state for the OS.
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // 2. Run the app. We use a struct so the closure can pass state cleanly.
    let result = run_app(&mut terminal);

    // 3. Terminal teardown, even if `run_app` returned an error.
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;

    result
}

/// The main event loop. Returns the same kind of error `main` returns.
fn run_app<B: ratatui::backend::Backend>(terminal: &mut Terminal<B>) -> io::Result<()> {
    let mut state = AppState::new();

    // View-only state that lives across frames. The textbox widget updates
    // the scroll offset as the user types and moves the cursor.
    let mut view = TextInputView::new();

    loop {
        terminal.draw(|f| ui::draw(f, &state, &mut view))?;

        // 100ms is short enough to feel responsive, long enough to not
        // spin the CPU. This is the same trick `cargo` uses for its UI.
        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    handle_key(&mut state, key.code);
                }
            }
        }

        if state.should_quit {
            return Ok(());
        }
    }
}

/// Translates a key press into a state change.
/// The textbox knows nothing about the terminal; we pass it the key directly.
fn handle_key(state: &mut AppState, code: KeyCode) {
    if code == KeyCode::Esc {
        state.should_quit = true;
        return;
    }

    // 80 is a reasonable default. The textbox will only see it when the
    // real frame width is unknown, which only happens before the first draw.
    state.input.handle_key(code, 80);
}
