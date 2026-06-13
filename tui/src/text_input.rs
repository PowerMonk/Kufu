// text_input.rs - The textbox's data layer.
//
// RESPONSIBILITY: Hold the raw text and the cursor, and apply character-level
// key presses. This module knows NOTHING about:
//   - terminal width,
//   - wrapping (that's `text_layout`),
//   - scrolling or viewports (that's `text_input_view`),
//   - ratatui.
//
// THE BUFFER MODEL
// The buffer is a single `String`. The cursor is a byte index into that
// string. A `\n` in the buffer is an explicit line break the user typed.
// There are no soft line breaks stored anywhere — soft wrapping is computed
// per frame by `text_layout`.
//
// THE CURSOR INVARIANT
// After every public method that mutates state, `cursor` is in `[0, buffer.len()]`
// AND it lies on a UTF-8 char boundary. Callers can trust this.
//
// WHY NO `Enter` HANDLER?
// `Enter` is policy: the main loop decides whether `Enter` means "submit
// prompt" (no-op for now) or "insert newline" (Shift+Enter). The textbox
// never sees `KeyCode::Enter`. To insert a newline, the caller passes
// `KeyCode::Char('\n')`. This keeps the data layer free of UI policy.

use unicode_segmentation::UnicodeSegmentation;

use crossterm::event::KeyCode;

pub struct TextInput {
    /// The raw buffer. Contains everything the user has typed.
    /// Newlines the user typed are stored as `\n` in this string.
    pub buffer: String,
    /// Byte index in `buffer` where the next typed character will land.
    /// Always in `[0, buffer.len()]` and on a UTF-8 char boundary.
    pub cursor: usize,
}

impl TextInput {
    /// Creates an empty textbox.
    pub fn new() -> Self {
        // `String::new()` allocates no heap memory until we push to it.
        // It's the cheapest empty-string type in Rust.
        Self {
            buffer: String::new(),
            cursor: 0,
        }
    }

    /// `true` if the buffer has no characters at all.
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    /// Moves the cursor to the given byte index, clamped to a valid position.
    /// Used by the widget when applying layout-computed cursor positions
    /// (e.g. after Up/Down navigation that the layout decides).
    pub fn set_cursor(&mut self, byte: usize) {
        // `floor_char_boundary` returns the largest valid char boundary
        // `<= byte`. Combined with `min(buffer.len())`, this guarantees
        // a safe, in-range cursor no matter what the caller passes.
        self.cursor = self.buffer.floor_char_boundary(byte.min(self.buffer.len()));
    }

    /// Applies a character-level key press.
    ///
    /// Handles: `Char`, `Backspace`, `Left`, `Right`.
    /// Does NOT handle `Enter` (the caller translates Enter to a Char('\n')
    /// or treats it as submit, depending on policy).
    /// Does NOT handle `Up`/`Down` (those are computed by `text_layout`).
    pub fn handle_key(&mut self, key: KeyCode) {
        // `match` on a KeyCode. Every variant is named in the standard
        // library; you can see the full list with `cargo doc crossterm`.
        match key {
            // The user typed a printable character (including '\n' for
            // explicit newlines, since the main loop converts Shift+Enter
            // into `Char('\n')`).
            KeyCode::Char(c) => self.insert_char(c),

            // Delete the character immediately before the cursor.
            KeyCode::Backspace => self.backspace(),

            // Move the cursor one grapheme cluster to the left.
            KeyCode::Left => self.move_left(),

            // Move the cursor one grapheme cluster to the right.
            KeyCode::Right => self.move_right(),

            // Any other key (Enter, Up, Down, Tab, F1, etc.) is ignored
            // by the data layer. The main loop handles those before
            // calling this method.
            _ => {}
        }
    }

    /// Inserts a single character at the cursor position.
    fn insert_char(&mut self, c: char) {
        // `String::insert` is byte-based; it will panic if the index isn't
        // on a char boundary. We maintain the invariant so this is safe.
        self.buffer.insert(self.cursor, c);
        // Move the cursor past the inserted character.
        // `len_utf8` returns the byte length of this `char` in UTF-8
        // (1 for ASCII, 2–4 for non-ASCII).
        self.cursor += c.len_utf8();
    }

    /// Removes the character immediately before the cursor and moves the
    /// cursor back to where the character used to be.
    fn backspace(&mut self) {
        // Nothing to delete if we're at the start of the buffer.
        if self.cursor == 0 {
            return;
        }

        // Find the byte index of the character that ENDS at `cursor`.
        // We walk back to the previous char boundary.
        let prev = self.buffer.floor_char_boundary(self.cursor - 1);

        // `drain` removes a range and returns the removed chars as an
        // iterator. We don't need them, so we just drop the iterator.
        self.buffer.drain(prev..self.cursor);
        self.cursor = prev;
    }

    /// Moves the cursor one grapheme cluster to the left.
    fn move_left(&mut self) {
        if self.cursor == 0 {
            return;
        }

        // Walk back one grapheme cluster. We do this by collecting the
        // graphemes in the prefix, taking the second-to-last, and asking
        // for its byte offset.
        let prefix = &self.buffer[..self.cursor];
        let graphemes: Vec<(usize, &str)> = prefix.grapheme_indices(true).collect();
        if let Some((byte_idx, _)) = graphemes.get(graphemes.len() - 2) {
            self.cursor = *byte_idx;
        }
        // If there's only one grapheme (i.e. cursor is at position 0 or 1),
        // we don't move. The branch above covers that case.
    }

    /// Moves the cursor one grapheme cluster to the right.
    fn move_right(&mut self) {
        // Walk the graphemes in the suffix starting at `cursor`.
        // The first one we find is the one we want to jump past.
        let suffix = &self.buffer[self.cursor..];
        for (offset, grapheme) in suffix.grapheme_indices(true) {
            // `offset` is relative to `suffix`, so add `self.cursor` to get
            // the absolute byte index past the grapheme.
            self.cursor += offset + grapheme.len();
            return;
        }
        // No grapheme to the right: we don't move.
    }
}

impl Default for TextInput {
    fn default() -> Self {
        Self::new()
    }
}
