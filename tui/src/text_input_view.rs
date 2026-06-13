// text_input_view.rs - The textbox's viewport (the scroll offset).
//
// RESPONSIBILITY: Decide which slice of the layout is currently visible.
// Holds the scroll offset, follows the cursor, and clamps on resize.
//
// This module does NOT know about:
//   - the buffer (it reads from a `TextLayout`),
//   - ratatui,
//   - key handling (the widget calls into this after a key press).
//
// C# COMPARISON: like a `ScrollViewer` in WPF or a `scrollTop` value in CSS.
// It's the part of the textbox that survives across frames but isn't part
// of the user's data.

use crate::text_layout::TextLayout;

/// View-only state for the textbox. Holds the scroll offset.
///
/// The view is created once per session and passed by mutable reference
/// through the rendering pipeline. The widget calls `follow_cursor` after
/// the textbox's cursor moves, and `clamp` after a terminal resize.
pub struct TextInputView {
    /// Index of the first visible visual line.
    /// `0` means the very first line of the layout is at the top of the
    /// textbox. Increasing this scrolls DOWN (older content scrolls out
    /// the top, newer content scrolls in from the bottom).
    pub scroll_top: usize,
}

impl TextInputView {
    /// Creates a new view that starts at the top of the layout.
    pub fn new() -> Self {
        Self { scroll_top: 0 }
    }

    /// Adjusts `scroll_top` so that the cursor's visual line is inside
    /// the visible window of `visible_rows` lines.
    ///
    /// Called after the cursor moves. The cursor's visual line is read
    /// from `layout.cursor.line`, which is set by `TextLayout::compute`.
    ///
    /// WHY MANUAL SCROLLING?
    /// Ratatui doesn't auto-scroll widgets when their content overflows.
    /// We have to tell it "show lines 3 through 8" ourselves. This is the
    /// same as setting `scrollTop` on a `<div>` with `overflow: auto` in CSS.
    pub fn follow_cursor(&mut self, layout: &TextLayout, visible_rows: usize) {
        if layout.lines.is_empty() {
            self.scroll_top = 0;
            return;
        }

        let visible_rows = visible_rows.max(1);
        let cursor_line = layout.cursor.line;

        // Case 1: cursor is above the visible window. Scroll up.
        if cursor_line < self.scroll_top {
            self.scroll_top = cursor_line;
            return;
        }

        // Case 2: cursor is at or past the bottom of the visible window.
        // The visible window covers lines [scroll_top, scroll_top + visible_rows).
        // We want the cursor to be the LAST visible line at most.
        let window_end = self.scroll_top + visible_rows;
        if cursor_line >= window_end {
            self.scroll_top = cursor_line + 1 - visible_rows;
        }
    }

    /// Clamps `scroll_top` to a valid range.
    /// Called after a terminal resize or any other event that might
    /// change how many lines are visible.
    ///
    /// - If `scroll_top` is now further than the layout allows, pull it back.
    /// - If `scroll_top` is at a valid position, leave it alone.
    pub fn clamp(&mut self, total_rows: usize, visible_rows: usize) {
        let visible_rows = visible_rows.max(1);
        // `saturating_sub` is the safe way to subtract without underflowing
        // on a `usize`. If `total_rows < visible_rows`, the result is 0
        // (we can't scroll at all).
        let max_scroll = total_rows.saturating_sub(visible_rows);
        if self.scroll_top > max_scroll {
            self.scroll_top = max_scroll;
        }
    }
}

impl Default for TextInputView {
    fn default() -> Self {
        Self::new()
    }
}
