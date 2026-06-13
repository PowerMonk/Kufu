// main.rs - Kufu TUI entry point.
//
// RESPONSIBILITY: This file ONLY does three things:
//   1. Set up the terminal (raw mode, alternate screen).
//   2. Run the event loop: draw, read input, update state, repeat.
//   3. Tear the terminal down cleanly on exit.
//
// Everything else lives in its own module:
//   - `state`         holds the app's data
//   - `text_input`    owns the textbox's raw buffer
//   - `text_layout`   wraps the buffer into visual lines (pure)
//   - `text_input_view`  owns the scroll offset
//   - `ui`            draws widgets
//   - `theme`         defines colors

mod state;
mod text_input;
mod text_input_view;
mod text_layout;
mod theme;
mod ui;

use std::io;

use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen};
use ratatui::{backend::CrosstermBackend, Terminal};

use crate::state::AppState;
use crate::text_input_view::TextInputView;
use crate::text_layout::TextLayout;
use crate::ui::widgets::nav_key_to_byte;

fn main() -> io::Result<()> {
    // 1. Terminal setup. We do this in three steps so a single failure still
    //    leaves the terminal in a usable state for the OS.
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // 2. Run the app.
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
        // We need the terminal width to compute the text layout, so the
        // layout can decide where Up/Down would land. We grab it once per
        // frame and reuse the value for both the draw and any key handling
        // that happens after.
        let frame_width = terminal.size()?.width;

        terminal.draw(|f| {
            // `f.area()` is the current frame's area. We pass the same
            // width to the layout computation so draw and key handling
            // agree.
            let _ = frame_width;
            ui::draw(f, &state, &mut view);
        })?;

        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    handle_key(&mut state, &mut view, key, frame_width);
                }
            }
        }

        if state.should_quit {
            return Ok(());
        }
    }
}

/// Translates a key press into a state change.
///
/// This is the policy layer. It decides:
///   - Esc quits,
///   - plain Enter is "submit" (no-op for now),
///   - Ctrl+Enter inserts a literal newline (we convert to `Char('\n')`),
///   - Up/Down are routed through the layout,
///   - everything else goes to the textbox's own key handler.
///
/// WHY CTRL+ENTER?
/// Ctrl+Enter is the more common "insert newline in a single-line input"
/// binding in modern TUI/CLI tools. It's also reported more reliably
/// across terminal emulators than Shift+Enter, which sometimes arrives
/// at the TUI with the modifier flag stripped on certain Windows consoles.
fn handle_key(
    state: &mut AppState,
    view: &mut TextInputView,
    key: KeyEvent,
    frame_width: u16,
) {
    if key.code == KeyCode::Esc {
        state.should_quit = true;
        return;
    }

    // Compute a TextLayout with the same width the next draw will use.
    // We need it to know where Up/Down should land the cursor.
    //
    // For a real resize-aware app, the width would live in a small struct
    // updated by the draw call. For now, computing it here on demand is
    // fine and keeps the main loop simple.
    let content_width = compute_content_width(frame_width);
    let layout = TextLayout::compute(&state.input.buffer, content_width, state.input.cursor);

    // 1. Submit policy: plain Enter submits the prompt.
    //    We don't have a real submit action yet — when the engine lands,
    //    this is where we hand the prompt to the planner.
    if key.code == KeyCode::Enter && !key.modifiers.contains(KeyModifiers::CONTROL) {
        // TODO(engine): hand state.input.buffer to the planner.
        // For now, Enter does nothing. The user can still type, scroll,
        // and quit. The "submit" path is intentionally a no-op so the
        // rest of the UI stays testable while the engine is being built.
        let _ = view;
        return;
    }

    // 2. Layout-dependent keys: Up/Down.
    if let Some(new_byte) = nav_key_to_byte(&layout, &state.input.buffer, key.code, state.input.cursor) {
        state.input.set_cursor(new_byte);
        return;
    }

    // 3. Ctrl+Enter -> insert newline. We translate it to a Char('\n')
    //    so the textbox never has to know about modifier keys.
    if key.code == KeyCode::Enter && key.modifiers.contains(KeyModifiers::CONTROL) {
        state.input.handle_key(KeyCode::Char('\n'));
        return;
    }

    // 4. Everything else (Char, Backspace, Left, Right) goes to the textbox.
    state.input.handle_key(key.code);
}

/// Mirrors the content-width computation in `widgets::draw_input` so the
/// layout used for key handling matches the layout used for drawing.
/// Centralizing this would be the next refactor; for now a copy keeps
/// the modules independent.
fn compute_content_width(frame_width: u16) -> usize {
    // box width = frame_width * 6/8, minus 2 for borders, minus 2 for padding.
    let box_width = (frame_width as usize) * 6 / 8;
    box_width.saturating_sub(2).saturating_sub(2).saturating_sub(1)
}
