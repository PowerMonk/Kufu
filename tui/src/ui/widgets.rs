// ui/widgets.rs - Individual widget drawing functions.
//
// RESPONSIBILITY: Each function here renders ONE piece of the screen. They
// are intentionally small and easy to read on their own. If a function grows
// past ~30 lines, it should probably be split.
//
// C# COMPARISON: think of each function as a UserControl's `Render` method.
// The parent layout decides positioning; each widget just paints itself.

use ratatui::{
    Frame,
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
};

use crate::{AppState, text_input::TextInput, theme};

/// The placeholder shown when the textbox is empty.
const PLACEHOLDER: &str = "Kufu I need you to...";

/// Inner padding inside the textbox, in cells.
/// This is the CSS `padding` property: applied to all four sides of the
/// content area so the text doesn't sit on top of the border.
const INPUT_PADDING: u16 = 1;

/// Right margin for the "pre-alpha" label, so it doesn't touch the screen edge.
const VERSION_RIGHT_MARGIN: u16 = 2;

// The number of rows above the bottomline the version name will be placed at.
const VERSION_BOTTOM_MARGIN: u16 = 1;

/// How many rows tall the textbox is (including borders).
const INPUT_BOX_HEIGHT: u16 = 8;

/// The ASCII art for the "Kufu" title.
/// `r#"..."#` is a raw string literal: no escapes, newlines are real newlines.
const KUFU_ART: &str = r#"
 ██╗  ██╗██╗   ██╗███████╗██╗   ██╗
 ██║ ██╔╝██║   ██║██╔════╝██║   ██║
 █████╔╝ ██║   ██║█████╗  ██║   ██║
 ██╔═██╗ ██║   ██║██╔══╝  ██║   ██║
 ██║  ██╗╚██████╔╝██║     ╚██████╔╝
 ╚═╝  ╚═╝ ╚═════╝ ╚═╝      ╚═════╝
"#;

// ---------------------------------------------------------------------------
// FrameLayout - the per-frame layout, computed once and shared by widgets.
// ---------------------------------------------------------------------------

/// Precomputed rectangles for the current frame.
///
/// WHY A STRUCT?
/// The Rust equivalent of a C# "class variable" that several methods share.
/// We compute these rectangles ONCE per frame, then pass `&FrameLayout` to
/// each widget so they all agree on the same positions. This avoids the
/// "computed the same thing twice" problem we had with `input_row`.
///
/// Each field is a `Rect` — a position + size on the terminal grid.
pub struct FrameLayout {
    /// The full screen area.
    pub screen: Rect,
    /// The vertical center of the screen (where the title/textbox live).
    /// `[0]` title, `[1]` gap, `[2]` input, `[3]` model.
    /// A single-threaded reference-counting pointer. 'Rc' stands for 'Reference Counted'.
    pub middle_rows: std::rc::Rc<[Rect]>,
    /// The textbox column area: `[0]` left margin, `[1]` textbox, `[2]` right margin.
    /// Computed against the textbox row only.
    pub input_columns: std::rc::Rc<[Rect]>,
    /// The model line column area: same proportions as `input_columns`,
    /// but computed against the model row. This puts the model BELOW the
    /// textbox and aligned with it, instead of next to it.
    pub model_columns: std::rc::Rc<[Rect]>,
}

impl FrameLayout {
    /// Computes the layout for a frame.
    pub fn compute(area: Rect) -> Self {
        // The middle band: top spacer / content / bottom spacer.
        // We compute this on the SCREEN area so the whole UI stays centered.
        let middle_rows = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(1), // top spacer grows to fill extra space
                Constraint::Length(17), // content (title + gap + input + model)
                Constraint::Min(1), // bottom spacer also grows to fill extra space, keeping the content centered
            ])
            .split(area);

        // Inside the middle band: title / gap / input / model.
        // The user wants the model line aligned with the textbox, so we
        // compute input_columns once and share it.
        let content_rows = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(7),   // title
                Constraint::Length(1),   // gap
                Constraint::Length(INPUT_BOX_HEIGHT), // textbox
                Constraint::Length(1),   // model line
            ])
            // what .split does is take the input rectangle (middle_rows[1]) and divide it into 4 rectangles stacked vertically, with heights according to the constraints above. So content_rows[0] is the title area, content_rows[2] is the textbox area, etc.
            .split(middle_rows[1]);

        // The textbox column: 1/8 margin / 6/8 box / 1/8 margin.
        // Computed against the textbox row.
        let input_columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Ratio(1, 8),
                Constraint::Ratio(6, 8),
                Constraint::Ratio(1, 8),
            ])
            // we take the content_rows[2] rectangle (the textbox row) and split it into 3 columns according to the ratios above. So input_columns[1] is the main textbox area, input_columns[0] and input_columns[2] are the left and right margins.
            .split(content_rows[2]);

        // The model line column: same proportions, but computed against
        // the MODEL row (content_rows[3]). This puts the model line BELOW
        // the textbox, horizontally aligned with it.
        let model_columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Ratio(1, 8),
                Constraint::Ratio(6, 8),
                Constraint::Ratio(1, 8),
            ])
            .split(content_rows[3]);

        // calling Self { ... } is how we construct a FrameLayout to return. We fill in the fields with the rectangles we computed.
        Self {
            screen: area,
            middle_rows: content_rows,
            input_columns,
            model_columns,
        }
    }
}

// ---------------------------------------------------------------------------
// TextInputView - the textbox's view-only state (the scroll offset).
// ---------------------------------------------------------------------------

/// View-only state for the textbox. Holds the scroll offset.
///
/// WHY A SEPARATE STRUCT?
/// The scroll offset is a render concern, not part of the text content.
/// In C#/XAML terms: this is the difference between `TextBox.Text` (the
/// data) and `ScrollViewer.VerticalOffset` (the view). The data doesn't
/// need to know it's being scrolled.
///
/// We pass this struct to the input widget each frame, and we ask it to
/// update itself based on the current cursor position.
pub struct TextInputView {
    /// Index of the first visible line in the buffer.
    pub scroll_top: usize,
}

impl TextInputView {
    /// Creates a new view that starts at the top of the buffer.
    pub fn new() -> Self {
        // assign 0 to scroll_top, so we start with the top of the buffer visible
        Self { scroll_top: 0 } 
    }

    /// Adjusts `scroll_top` so that `cursor_line` is inside the visible
    /// window of `visible_rows` lines. Called after every cursor move.
    ///
    /// WHY MANUAL SCROLLING?
    /// Ratatui doesn't auto-scroll widgets when their content overflows.
    /// We have to tell it "show lines 3 through 8" ourselves. This is the
    /// same as setting `scrollTop` on a `<div>` with `overflow: auto` in CSS.
    pub fn follow_cursor(&mut self, input: &TextInput, visible_rows: usize) {
        // If the cursor is above the visible window, scroll up.
        if input.cursor_line < self.scroll_top {
            self.scroll_top = input.cursor_line;
            return;
        }

        // If the cursor is below the visible window, scroll down.
        // The visible window covers lines [scroll_top, scroll_top + visible_rows).
        // We want the cursor to be the LAST visible line at most, so:
        let window_end = self.scroll_top + visible_rows;
        if input.cursor_line >= window_end {
            self.scroll_top = input.cursor_line + 1 - visible_rows;
        }
    }
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

/// Paints the background of the whole screen.
/// Without this, empty areas would keep the terminal's default (black) color.
pub fn draw_background(f: &mut Frame, area: Rect) {
    let block = Block::default().style(Style::default().bg(theme::BG));
    f.render_widget(block, area);
}

/// Draws the big ASCII-art title, centered horizontally.
pub fn draw_title(f: &mut Frame, area: Rect) {
    // KUFU_ART.lines() iterates over the lines of the string. We skip the
    // first empty line that the raw string literal starts with.
    let lines: Vec<Line> = KUFU_ART
        .lines()
        // skip 1 to ignore the first empty line caused by the raw string literal starting with a newline.
        .skip(1)
        //  the | | operator is used to combine two styles: the foreground color (theme::ACCENT) and the bold modifier. This way we can apply both styles to the title text.
        .map(|line| {
            // A `Line` is one row of text. A `Span` is a piece of styled text.
            // We style the whole line with the accent color and bold.
            Line::from(Span::styled(
                line,
                Style::default()
                    .fg(theme::ACCENT)
                    .add_modifier(Modifier::BOLD),
            ))
        })
        // collect() takes ownership of an iterator and produces whichever collection type you request.
        .collect();

    let paragraph = Paragraph::new(lines)
        .alignment(Alignment::Center)
        .style(Style::default().bg(theme::BG));

    f.render_widget(paragraph, area);
}

/// Draws the model info row ("model X | ctx: 128k").
/// Uses `layout.model_columns[1]` so the model line sits BELOW the textbox,
/// in the same horizontal position.
pub fn draw_model(f: &mut Frame, state: &AppState, layout: &FrameLayout) {
    let model_area = layout.model_columns[1];

    let line = Line::from(vec![
        Span::styled("model ", Style::default().fg(theme::ACCENT_ALT)),
        Span::styled(&state.model.name, Style::default().fg(theme::TEXT)),
        Span::styled(" | ", Style::default().fg(theme::TEXT_DIM)),
        Span::styled(
            format!("ctx: {}", state.model.context_window),
            Style::default().fg(theme::TEXT_DIM),
        ),
    ]);

    let paragraph = Paragraph::new(line)
        .alignment(Alignment::Left)
        .style(Style::default().bg(theme::BG));

    f.render_widget(paragraph, model_area);
}

/// Draws the "pre-alpha" label in the bottom-right of the whole screen,
/// with a small margin from the right edge.
pub fn draw_version(f: &mut Frame, layout: &FrameLayout) {
    // Step 1: reserve a small vertical margin above the bottom line so the
    // label doesn't sit flush against the screen edge. Layout: [flex] [Length(VERSION_RIGHT_MARGIN) margin] [Length(1) bottom]
    let bottom_row = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),
            Constraint::Length(VERSION_RIGHT_MARGIN),
            Constraint::Length(1),
        ])
        // pick the margin row (one above the very bottom) so the label is
        // lifted up by VERSION_RIGHT_MARGIN rows.
        .split(layout.screen)[1];

    // Step 2: take a chunk on the right of that row, leaving a margin.
    // Layout: [Min(1) flex space] [Length(9) label] [Length(VERSION_RIGHT_MARGIN) margin]
    // The right margin is a real gap, like CSS `margin-right`.
    let label_area = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Min(1),
            Constraint::Length(9),
            Constraint::Length(VERSION_BOTTOM_MARGIN),
        ])
        .split(bottom_row)[1];

    let paragraph = Paragraph::new(Line::from(Span::styled(
        "pre-alpha",
        Style::default().fg(theme::TEXT_DIM),
    )))
    .alignment(Alignment::Right);

    f.render_widget(paragraph, label_area);
}

/// Draws the textbox. This is the most complex widget because it draws
/// content AND the cursor, AND it manages scrolling.
pub fn draw_input(
    f: &mut Frame,
    state: &AppState,
    layout: &FrameLayout,
    view: &mut TextInputView,
) {
    // The textbox sits in the same column as the model line.
    let box_area = layout.input_columns[1];

    // Inner area = box minus the 1-cell border on each side.
    let bordered_inner = Rect {
        x: box_area.x + 1,
        y: box_area.y + 1,
        width: box_area.width.saturating_sub(2),
        height: box_area.height.saturating_sub(2),
    };

    // The block has a subtle border and a slightly lighter surface.
    // `Borders::ALL` draws top + bottom + left + right.
    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme::BORDER))
        .style(Style::default().bg(theme::SURFACE));
    f.render_widget(block, box_area);

    // The content area is the bordered area minus our padding on all 4 sides.
    // `padding` here works exactly like CSS `padding` on a container.
    let content_area = Rect {
        x: bordered_inner.x + INPUT_PADDING,
        y: bordered_inner.y + INPUT_PADDING,
        // multiply padding by 2 to account for both left and right (or top and bottom) padding.
        width: bordered_inner.width.saturating_sub(INPUT_PADDING * 2),
        height: bordered_inner.height.saturating_sub(INPUT_PADDING * 2),
    };

    // The wrap width is how many characters fit on one line of the content.
    // We use saturating_sub(1) to leave a 1-char right padding (handled by
    // INPUT_PADDING on the right of content_area, so this is a small safety
    // margin against off-by-one errors).
    let wrap_width = content_area.width.saturating_sub(1) as usize;

    // Decide which slice of the textbox's lines is currently visible.
    // The textbox shows at most `MAX_VISIBLE_ROWS` lines. The view decides
    // WHICH `MAX_VISIBLE_ROWS` lines we show.
    let visible_rows = content_area.height as usize;

    if state.input.is_empty() {
        // No text: show the placeholder in the middle of the content area.
        draw_placeholder(f, content_area, visible_rows);
    } else {
        // There's text: scroll so the cursor stays visible, then draw.
        view.follow_cursor(&state.input, visible_rows);
        draw_text(f, &state.input, view, content_area, visible_rows, wrap_width);
        set_text_cursor(f, &state.input, view, content_area);
    }
}

/// Draws the centered placeholder inside an empty textbox.
fn draw_placeholder(f: &mut Frame, content: Rect, visible_rows: usize) {
    // We render `visible_rows` empty lines, with the placeholder in the middle.
    // This creates the "padding above and below" look the user asked for.
    let placeholder_row = visible_rows / 2;

    let lines: Vec<Line> = (0..visible_rows)
        .map(|row| {
            if row == placeholder_row {
                Line::from(Span::styled(PLACEHOLDER, Style::default().fg(theme::PLACEHOLDER)))
            } else {
                Line::from("")
            }
        })
        .collect();

    f.render_widget(Paragraph::new(lines), content);
}

/// Draws the user's text inside the textbox, taking the current scroll
/// offset into account.
fn draw_text(
    f: &mut Frame,
    input: &TextInput,
    view: &TextInputView,
    content: Rect,
    visible_rows: usize,
    wrap_width: usize,
) {
    let _ = wrap_width; // kept for future use if we change the model

    // Slice the lines according to the current scroll position.
    // Like CSS `overflow: auto` — we only paint the visible window.
    let start = view.scroll_top;
    // use .min to avoid going past the end of the buffer if the scroll position is near the bottom. So `end` is either `start + visible_rows` or the total number of lines, whichever is smaller.
    let end = (start + visible_rows).min(input.lines.len());

    let lines: Vec<Line> = input.lines[start..end]
        .iter()
        .map(|line| Line::from(Span::styled(line, Style::default().fg(theme::TEXT))))
        .collect();

    f.render_widget(Paragraph::new(lines), content);
}

/// Tells ratatui where the real terminal cursor should be drawn.
/// The cursor is placed at `view.scroll_top` + the cursor's offset within
/// the visible window. `content` is the inner area WITH padding applied,
/// which is what we want the cursor to respect.
fn set_text_cursor(
    f: &mut Frame,
    input: &TextInput,
    view: &TextInputView,
    content: Rect,
) {
    // `cursor_line` is an index into the FULL buffer. Subtract the scroll
    // offset to get the cursor's position INSIDE the visible window.
    let visible_line = input.cursor_line.saturating_sub(view.scroll_top);

    let cursor_x = content.x + input.cursor_col as u16;
    let cursor_y = content.y + visible_line as u16;

    // Sanity check: don't draw the cursor outside the content area.
    if cursor_x < content.x + content.width && cursor_y < content.y + content.height {
        f.set_cursor_position((cursor_x, cursor_y));
    }
}
