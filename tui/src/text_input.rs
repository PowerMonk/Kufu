// text_input.rs - The textbox state.
//
// RESPONSIBILITY: Hold the textbox buffer (one entry per line) and the cursor
// position, and apply keystrokes to that state. Nothing here knows about the
// terminal, ratatui, or rendering.
//
// WHY A VEC<STRING> AND NOT A SINGLE STRING?
// Storing the buffer as `Vec<String>` makes line breaks explicit. Each entry
// is one visual line. This is much easier to reason about than tracking a
// single string plus byte indices, and it removes the need for char-boundary
// math. Think of it like splitting a textarea's value on '\n' in JS and
// keeping it as an array of strings.
//
// CURSOR MODEL:
// `cursor_line` is the index into `lines`.
// `cursor_col`  is the byte index inside that line's string.
// We always keep both in range (cursor_col <= lines[cursor_line].len()).

use crossterm::event::KeyCode;

pub struct TextInput {
    /// One string per visual line. Never empty.
    pub lines: Vec<String>,
    /// Index into `lines`.
    pub cursor_line: usize,
    /// Byte index inside `lines[cursor_line]`.
    pub cursor_col: usize,
}

impl TextInput {
    /// Creates a textbox with a single empty line.
    pub fn new() -> Self {
        // `vec![...]` is a macro that builds a `Vec`. We start with one empty
        // string so the cursor always has somewhere to live.
        Self {
            lines: vec![String::new()],
            cursor_line: 0,
            cursor_col: 0,
        }
    }

    /// `true` if the buffer contains no characters at all.
    pub fn is_empty(&self) -> bool {
        self.lines.len() == 1 && self.lines[0].is_empty()
    }

    /// Returns the current line's text as a string slice.
    /// We know `cursor_line` is always valid, so direct indexing is safe.
    pub fn current_line(&self) -> &str {
        &self.lines[self.cursor_line]
    }

    /// Applies a key press to the buffer.
    /// `wrap_width` is the number of characters that fit on one line; the
    /// input widget passes it in based on the current layout.
    pub fn handle_key(&mut self, key: KeyCode, wrap_width: usize) {
        // `match` is like a `switch` in C#/JS, but it MUST cover every case
        // (the compiler enforces it). The `_ => {}` arm is the "ignore
        // anything else" case.
        match key {
            KeyCode::Char(c) => self.insert_char(c, wrap_width),
            KeyCode::Enter => self.insert_newline(),
            KeyCode::Backspace => self.backspace(),
            KeyCode::Left => self.move_left(),
            KeyCode::Right => self.move_right(),
            KeyCode::Up => self.move_up(),
            KeyCode::Down => self.move_down(),
            // `_` is the wildcard pattern: "anything we didn't list above".
            _ => {}
        }
    }

    /// Inserts a single character at the cursor.
    /// If the current line would exceed `wrap_width` characters, the tail is
    /// pushed onto a new line below, and the cursor follows the break.
    fn insert_char(&mut self, c: char, wrap_width: usize) {
        // We measure "width" as character count, not byte count. `chars().count()`
        // walks the string and counts each `char`. This is fine for ASCII; for
        // full Unicode (emoji, CJK) you'd want `unicode-width`, but for this
        // learning project, character count is good enough.
        let current = self.current_line();
        let current_width = current.chars().count();

        if current_width >= wrap_width {
            // The current line is full: start a new line with this char.
            // We push a new line *after* the current one, then move into it.
            self.cursor_line += 1;
            self.cursor_col = 0;
            self.lines.insert(self.cursor_line, String::new());
            self.lines[self.cursor_line].push(c);
            self.cursor_col = c.len_utf8();
            return;
        }

        // Normal case: insert the char at the cursor's byte position.
        self.lines[self.cursor_line].insert(self.cursor_col, c);
        self.cursor_col += c.len_utf8();
    }

    /// Inserts a newline, splitting the current line at the cursor.
    /// Anything to the right of the cursor moves to the new line.
    /// This is how text editors behave: cursor at column 3 + Enter splits the
    /// line into "left part" and "right part".
    fn insert_newline(&mut self) {
        // Step 1: take the right part out of the current line.
        // `split_off` keeps the first `at` chars in `self`, returns the rest.
        // After this, the current line is the "left part" and `right` is
        // the "right part".
        let right = self.lines[self.cursor_line].split_off(self.cursor_col);

        // Step 2: insert a new line below with the right part.
        self.cursor_line += 1;
        self.cursor_col = 0;
        self.lines.insert(self.cursor_line, right);
    }

    /// Deletes the character immediately before the cursor.
    /// If we're at the start of a line, the current line is merged with the
    /// previous one and the cursor lands at the join point.
    fn backspace(&mut self) {
        if self.cursor_col > 0 {
            // Remove the previous character on the current line.
            // `char_indices` yields `(byte_index, char)` pairs. We find the
            // start of the previous char, then `drain` removes that range.
            // This is how `String::drain` works: `start..end` is removed.
            let line = &mut self.lines[self.cursor_line];
            let prev = previous_char_byte_index(line, self.cursor_col);
            line.drain(prev..self.cursor_col);
            self.cursor_col = prev;
        } else if self.cursor_line > 0 {
            // We're at the start of a line: merge with the previous line.
            let current = self.lines.remove(self.cursor_line);
            self.cursor_line -= 1;
            let prev_len = self.lines[self.cursor_line].len();
            // `push_str` appends a string slice to the end of a String.
            self.lines[self.cursor_line].push_str(&current);
            self.cursor_col = prev_len;
        }
    }

    /// Moves the cursor one character to the left.
    /// In Rust, `&mut self` means we may change the struct's fields.
    fn move_left(&mut self) {
        if self.cursor_col > 0 {
            let line = &self.lines[self.cursor_line];
            self.cursor_col = previous_char_byte_index(line, self.cursor_col);
        } else if self.cursor_line > 0 {
            // Jump to the end of the previous line.
            self.cursor_line -= 1;
            self.cursor_col = self.lines[self.cursor_line].len();
        }
    }

    /// Moves the cursor one character to the right.
    fn move_right(&mut self) {
        let line_len = self.lines[self.cursor_line].len();
        if self.cursor_col < line_len {
            self.cursor_col = next_char_byte_index(&self.lines[self.cursor_line], self.cursor_col);
        } else if self.cursor_line + 1 < self.lines.len() {
            // Jump to the start of the next line.
            self.cursor_line += 1;
            self.cursor_col = 0;
        }
    }

    /// Moves the cursor up one line, keeping the column if possible.
    fn move_up(&mut self) {
        if self.cursor_line == 0 {
            return;
        }
        self.cursor_line -= 1;
        // Clamp the column to the new line's length.
        let max = self.lines[self.cursor_line].len();
        if self.cursor_col > max {
            self.cursor_col = max;
        }
    }

    /// Moves the cursor down one line, keeping the column if possible.
    fn move_down(&mut self) {
        if self.cursor_line + 1 >= self.lines.len() {
            return;
        }
        self.cursor_line += 1;
        let max = self.lines[self.cursor_line].len();
        if self.cursor_col > max {
            self.cursor_col = max;
        }
    }
}

// --- free helpers -----------------------------------------------------------

/// Returns the byte index of the character that ENDS at `index`.
/// In other words, walks back until we find a UTF-8 char boundary.
fn previous_char_byte_index(s: &str, index: usize) -> usize {
    let mut i = index - 1;
    // `is_char_boundary` returns `true` if `i` is on a char boundary.
    // We walk backwards until we find one. For ASCII, this is one step.
    while !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

/// Returns the byte index of the character that STARTS at or after `index`.
fn next_char_byte_index(s: &str, index: usize) -> usize {
    let mut i = index + 1;
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}
