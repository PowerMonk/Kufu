// text_layout.rs - Visual layout for a text buffer.
//
// RESPONSIBILITY: Given a raw text buffer and a width in cells, produce
// the list of visual lines (byte ranges into the buffer) and provide
// helpers to map between byte cursors and visual positions.
//
// This module knows NOTHING about:
//   - the textbox's storage (it only sees a `&str`),
//   - ratatui,
//   - scrolling or viewports (that's `text_input_view`).
//
// WHY A STRUCT AND NOT PURE FUNCTIONS?
// Per the architecture discussion: as Kufu grows, the layout will need to
// carry extra derived state (autocomplete anchors, mention locations, etc.).
// A struct gives us a single value to extend without changing call sites.
// For now, the struct is built fresh per frame and discarded — cheap to
// construct, simple to reason about.
//
// C# COMPARISON: this is the difference between
//   `static List<string> Wrap(string text, int width)` (a function)
// and
//   `class WrapResult { public List<string> Lines; public Cursor Pos; }` (a value object).
// We're going with the value object.

use unicode_segmentation::UnicodeSegmentation;

/// A single visual line in the laid-out buffer.
///
/// The `start` and `end` are byte indices into the original buffer.
/// `text` is a borrowed slice of the buffer for convenience. The widget
/// reads `text` to paint the line; future parsers can use `start..end`
/// to map back to the raw buffer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VisualLine {
    /// Byte index in the original buffer where this line starts.
    pub start: usize,
    /// Byte index in the original buffer where this line ends (exclusive).
    pub end: usize,
}

impl VisualLine {
    /// Returns the text of this line as a slice of the original buffer.
    pub fn text<'a>(&self, buffer: &'a str) -> &'a str {
        // `get` is the safe version of slicing: returns `None` if the indices
        // aren't on a UTF-8 char boundary or are out of range. We trust our
        // own indices, but using `get` makes the function total (never panics).
        buffer.get(self.start..self.end).unwrap_or("")
    }
}

/// A visual cursor position: (line index, column in grapheme clusters).
///
/// We measure columns in *grapheme clusters*, not bytes or chars. A grapheme
/// cluster is what a user sees as one "character" — `é` is one cluster even
/// though it's two bytes, and emoji can be multiple bytes but one cluster.
/// This matches how every modern text editor counts columns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct VisualCursor {
    /// Index into the `TextLayout::lines` vector.
    pub line: usize,
    /// Column in grapheme clusters, measured from the start of the line.
    pub column: usize,
}

/// Per-frame snapshot of how the buffer should be displayed at a given width.
#[derive(Debug, Clone)]
pub struct TextLayout {
    /// The visual lines, in order. Always non-empty: an empty buffer
    /// produces one empty visual line.
    pub lines: Vec<VisualLine>,
    /// Where the byte cursor maps to in the laid-out buffer.
    pub cursor: VisualCursor,
}

impl TextLayout {
    /// Computes the layout for a buffer at a given width.
    ///
    /// `byte_cursor` is the cursor position in the original buffer. It does
    /// not have to be on a char boundary; the function rounds it down to the
    /// nearest valid position. This keeps callers from having to clamp.
    pub fn compute(buffer: &str, width: usize, byte_cursor: usize) -> Self {
        // `width.max(1)` so a zero-width terminal still has a defined
        // behavior (every char is its own line, which is fine for tests).
        let width = width.max(1);

        let lines = wrap_buffer(buffer, width);
        // Clamp the cursor to the buffer's range, then find the visual pos.
        let cursor_byte = byte_cursor.min(buffer.len());
        let cursor = byte_to_visual(&lines, buffer, cursor_byte);

        Self { lines, cursor }
    }

    /// Returns the byte index that the cursor would land on if the user
    /// pressed `Up` from the given byte position.
    ///
    /// "Up" here means: move to the same column in the previous visual line.
    /// If the previous line is shorter than the current column, we move to
    /// the end of the previous line.
    /// If we're already on the first visual line, the cursor doesn't move.
    pub fn cursor_up(&self, buffer: &str, byte_cursor: usize) -> usize {
        if self.cursor.line == 0 {
            return clamp_byte(buffer, byte_cursor);
        }
        let target_line = self.cursor.line - 1;
        visual_to_byte(&self.lines, target_line, self.cursor.column, buffer)
    }

    /// Returns the byte index that the cursor would land on if the user
    /// pressed `Down` from the given byte position.
    ///
    /// "Down" here means: move to the same column in the next visual line.
    /// If the next line is shorter than the current column, we move to the
    /// end of the next line.
    /// If we're already on the last visual line, the cursor doesn't move.
    pub fn cursor_down(&self, buffer: &str, byte_cursor: usize) -> usize {
        let last = self.lines.len().saturating_sub(1);
        if self.cursor.line >= last {
            return clamp_byte(buffer, byte_cursor);
        }
        let target_line = self.cursor.line + 1;
        visual_to_byte(&self.lines, target_line, self.cursor.column, buffer)
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Splits a buffer into visual lines, each at most `width` grapheme clusters.
/// Hard newlines (`\n`) always break a line. Long lines break at `width`.
fn wrap_buffer(buffer: &str, width: usize) -> Vec<VisualLine> {
    // An empty buffer still produces one (empty) visual line so the renderer
    // can always show at least one row.
    if buffer.is_empty() {
        return vec![VisualLine { start: 0, end: 0 }];
    }

    let mut lines = Vec::new();
    let mut line_start = 0usize;
    let mut col = 0usize;

    // We walk the buffer grapheme by grapheme, which is what we want for
    // display width. `\n` is a "grapheme" too — `graphemes` includes it.
    for (byte_idx, grapheme) in buffer.grapheme_indices(true) {
        // A hard newline ends the current line and starts a new one.
        if grapheme == "\n" {
            lines.push(VisualLine {
                start: line_start,
                end: byte_idx,
            });
            // The next line starts AFTER the newline character.
            line_start = byte_idx + "\n".len();
            col = 0;
            continue;
        }

        // If this grapheme would push us past the width, break the line.
        // `col == width` means we've already filled the line; we break
        // BEFORE placing the new grapheme.
        if col == width {
            lines.push(VisualLine {
                start: line_start,
                end: byte_idx,
            });
            line_start = byte_idx;
            col = 0;
        }

        col += 1;
    }

    // Push the final line (everything since the last break).
    lines.push(VisualLine {
        start: line_start,
        end: buffer.len(),
    });

    lines
}

/// Maps a byte cursor in the buffer to a (visual_line, column) position.
fn byte_to_visual(lines: &[VisualLine], buffer: &str, byte_cursor: usize) -> VisualCursor {
    // Find the line whose byte range contains `byte_cursor`.
    // The lines were computed by `wrap_buffer` and their ranges reflect
    // BOTH hard newlines and soft wraps, so we don't have to redo the
    // wrapping math here.
    let cursor_byte = byte_cursor.min(buffer.len());
    let cursor_byte = buffer.floor_char_boundary(cursor_byte);

    for (line_index, line) in lines.iter().enumerate() {
        // The line covers bytes [start, end). The cursor belongs to this
        // line if it falls in that range. We use `<=` (inclusive on the
        // upper bound) so a cursor sitting at the END of a line still
        // belongs to that line — otherwise the cursor would appear to jump
        // to the next line as soon as the user types the last char of a
        // row, which feels wrong.
        //
        // The last line gets a special case so a cursor past its end still
        // belongs to it (rather than being "after" it).
        let in_range = cursor_byte <= line.end;
        let is_last = line_index + 1 == lines.len();
        if in_range || is_last {
            // Count grapheme clusters from `line.start` to `cursor_byte`
            // to get the column.
            let line_text = line.text(buffer);
            let prefix_len = cursor_byte.saturating_sub(line.start);
            let column = line_text[..prefix_len].graphemes(true).count();
            return VisualCursor {
                line: line_index,
                column,
            };
        }
    }

    // Should be unreachable because `lines` always has at least one entry
    // and the loop above handles the last line. Defensive fallback.
    VisualCursor::default()
}

/// Maps a (visual_line, column) to a byte index in the buffer.
/// If `column` is past the end of the line, returns the byte index of the
/// line's end. If `line_index` is out of range, returns `buffer.len()`.
fn visual_to_byte(lines: &[VisualLine], line_index: usize, column: usize, buffer: &str) -> usize {
    let line = match lines.get(line_index) {
        Some(line) => line,
        None => return buffer.len(),
    };

    let mut col = 0usize;
    let line_text = line.text(buffer);

    for (byte_offset, _grapheme) in line_text.grapheme_indices(true) {
        if col == column {
            return line.start + byte_offset;
        }
        col += 1;
    }

    // Column was past the end of the line: return the end of the line.
    line.end
}

/// Clamps a byte index to a valid position in the buffer.
/// Used to defend against callers passing a cursor outside the buffer.
fn clamp_byte(buffer: &str, byte: usize) -> usize {
    let clamped = byte.min(buffer.len());
    // `floor_char_boundary` is a stable API that walks down to the nearest
    // valid UTF-8 boundary. Returns the input unchanged if it's already
    // a valid boundary.
    buffer.floor_char_boundary(clamped)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Wrapping ----------------------------------------------------------

    #[test]
    fn empty_buffer_has_one_empty_line() {
        let layout = TextLayout::compute("", 10, 0);
        assert_eq!(layout.lines.len(), 1);
        assert_eq!(layout.lines[0].text(""), "");
    }

    #[test]
    fn short_buffer_fits_one_line() {
        let layout = TextLayout::compute("hi", 10, 0);
        assert_eq!(layout.lines.len(), 1);
        assert_eq!(layout.lines[0].text("hi"), "hi");
    }

    #[test]
    fn explicit_newline_breaks_line() {
        let layout = TextLayout::compute("a\nb", 10, 0);
        assert_eq!(layout.lines.len(), 2);
        assert_eq!(layout.lines[0].text("a\nb"), "a");
        assert_eq!(layout.lines[1].text("a\nb"), "b");
    }

    #[test]
    fn long_line_wraps_at_width() {
        let layout = TextLayout::compute("abcdef", 3, 0);
        assert_eq!(layout.lines.len(), 2);
        assert_eq!(layout.lines[0].text("abcdef"), "abc");
        assert_eq!(layout.lines[1].text("abcdef"), "def");
    }

    #[test]
    fn mixed_hard_and_soft_breaks() {
        let buffer = "ab\ncdefgh";
        let layout = TextLayout::compute(buffer, 3, 0);
        assert_eq!(layout.lines.len(), 3);
        assert_eq!(layout.lines[0].text(buffer), "ab");
        assert_eq!(layout.lines[1].text(buffer), "cde");
        assert_eq!(layout.lines[2].text(buffer), "fgh");
    }

    // Cursor mapping ---------------------------------------------------

    #[test]
    fn cursor_at_start_is_zero_zero() {
        let layout = TextLayout::compute("hello", 10, 0);
        assert_eq!(layout.cursor, VisualCursor { line: 0, column: 0 });
    }

    #[test]
    fn cursor_after_newline_is_next_line_zero() {
        let layout = TextLayout::compute("a\nb", 10, 1);
        // Cursor is between "a" and "\n", so it's still on line 0, col 1.
        assert_eq!(layout.cursor, VisualCursor { line: 0, column: 1 });
    }

    #[test]
    fn cursor_after_explicit_newline_is_next_line() {
        // Buffer "a\nb": byte 2 is right after the newline, on line 1, col 0.
        let layout = TextLayout::compute("a\nb", 10, 2);
        assert_eq!(layout.cursor, VisualCursor { line: 1, column: 0 });
    }

    #[test]
    fn cursor_in_wrapped_line_maps_correctly() {
        // Buffer "abcdef", width 3 -> lines: "abc", "def"
        // Byte 4 is 'e', on line 1, col 1.
        let layout = TextLayout::compute("abcdef", 3, 4);
        assert_eq!(layout.cursor, VisualCursor { line: 1, column: 1 });
    }

    #[test]
    fn cursor_past_end_clamps_to_end() {
        let layout = TextLayout::compute("hi", 10, 100);
        assert_eq!(layout.cursor, VisualCursor { line: 0, column: 2 });
    }

    // Visual navigation ------------------------------------------------

    #[test]
    fn up_from_first_line_does_not_move() {
        let buffer = "ab\ncd";
        let layout = TextLayout::compute(buffer, 10, 0);
        assert_eq!(layout.cursor_up(buffer, 0), 0);
    }

    #[test]
    fn down_from_last_line_does_not_move() {
        let buffer = "ab\ncd";
        let layout = TextLayout::compute(buffer, 10, 3);
        assert_eq!(layout.cursor_down(buffer, 3), 3);
    }

    #[test]
    fn up_across_explicit_newline() {
        // Buffer "ab\ncd", cursor at byte 4 ('d'), col 1 on line 1.
        // Up should land at line 0, col 1 -> byte 1 ('b').
        let buffer = "ab\ncd";
        let layout = TextLayout::compute(buffer, 10, 4);
        assert_eq!(layout.cursor_up(buffer, 4), 1);
    }

    #[test]
    fn down_across_explicit_newline() {
        // Buffer "ab\ncd", cursor at byte 1 ('b'), col 1 on line 0.
        // Down should land at line 1, col 1 -> byte 4 ('d').
        let buffer = "ab\ncd";
        let layout = TextLayout::compute(buffer, 10, 1);
        assert_eq!(layout.cursor_down(buffer, 1), 4);
    }

    #[test]
    fn up_clamps_to_shorter_line() {
        // Buffer "abc\nde", cursor at byte 6 ('e' end), col 2 on line 1.
        // Up should land at line 0, col 2 -> byte 2 ('c').
        let buffer = "abc\nde";
        let layout = TextLayout::compute(buffer, 10, 6);
        assert_eq!(layout.cursor_up(buffer, 6), 2);
    }

    #[test]
    fn up_clamps_to_end_of_shorter_line() {
        // Buffer "ab\ncde", cursor at byte 5 ('e' end), col 2 on line 1.
        // Up to line 0 (length 2), col 2 -> past the end -> byte 2 (end of "ab").
        let buffer = "ab\ncde";
        let layout = TextLayout::compute(buffer, 10, 5);
        assert_eq!(layout.cursor_up(buffer, 5), 2);
    }

    // Resize safety ----------------------------------------------------

    #[test]
    fn compute_with_zero_width_does_not_panic() {
        // Width 0 is degenerate, but the function should still terminate
        // and produce a sensible result.
        let layout = TextLayout::compute("hello", 0, 0);
        // Every grapheme becomes its own line.
        assert_eq!(layout.lines.len(), "hello".graphemes(true).count());
    }
}
