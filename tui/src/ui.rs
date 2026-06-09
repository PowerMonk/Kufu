// ui.rs - User interface orchestration.
//
// RESPONSIBILITY: Decide WHERE things go on the screen, then call small
// widget functions to draw them. Each widget is its own function in
// `ui::widgets`. This file should stay short.

pub mod widgets;

use ratatui::Frame;

use crate::AppState;
use crate::ui::widgets::{FrameLayout, TextInputView};

/// Draws a single frame.
///
/// `view` holds view-only state (currently just the textbox scroll offset)
/// that must SURVIVE across frames. We pass it by mutable reference so
/// the textbox can update the scroll position as the user types.
///
/// C# COMPARISON: like a `private ScrollViewer _scroll` field on a
/// UserControl that lives for the whole session.
pub fn draw(f: &mut Frame, state: &AppState, view: &mut TextInputView) {
    // 1. Compute the layout ONCE for this frame.
    //    Every widget reads from `layout`, none of them recompute.
    let layout = FrameLayout::compute(f.area());

    // 2. Paint the background first so every other widget sits on it.
    widgets::draw_background(f, layout.screen);

    // 3. Draw the four widgets in the middle band.
    //    The textbox needs `&mut view` because it updates the scroll offset.
    widgets::draw_title(f, layout.middle_rows[0]);
    widgets::draw_input(f, state, &layout, view);
    widgets::draw_model(f, state, &layout);

    // 4. Version label lives in the bottom-right of the WHOLE screen.
    widgets::draw_version(f, &layout);
}
