// ui/widgets.rs - Individual widget drawing functions.
//
// RESPONSIBILITY: Each function here renders ONE piece of the screen. They
// are intentionally small and easy to read on their own. If a function grows
// past ~30 lines, it should probably be split.
//
// C# COMPARISON: think of each function as a UserControl's `Render` method.
// The parent layout decides positioning; each widget just paints itself.
//
// INPUT WIDGET NOTE
// The input widget is more than a paint function: it's also the "view
// controller" for the textbox. It owns the per-frame `TextLayout`, routes
// navigation keys through the layout, and exposes a small handler the
// main loop can call for layout-dependent keys (Up/Down today, possibly
// more later).

use crossterm::event::KeyCode;
use ratatui::{
    Frame,
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
};

use crate::{
    AppState,
    text_input_view::TextInputView,
    text_layout::TextLayout,
    theme,
};

/// The placeholder shown when the textbox is empty.
const PLACEHOLDER: &str = "Kufu I need you to...";

/// Inner padding inside the textbox, in cells.
/// This is the CSS `padding` property: applied to all four sides of the
/// content area so the text doesn't sit on top of the border.
const INPUT_PADDING: u16 = 1;

/// Maximum number of visible content rows the textbox will ever show.
/// Above this, the viewport scrolls. Below this, the textbox grows
/// to fit the content (between 1 and this value).
const MAX_INPUT_ROWS: usize = 6;

/// Minimum number of visible content rows. The textbox is never smaller
/// than this, even when empty (so the placeholder has room to breathe).
const MIN_INPUT_ROWS: usize = 1;

/// Right margin for the "pre-alpha" label, so it doesn't touch the screen edge.
const VERSION_RIGHT_MARGIN: u16 = 2;

/// How many rows above the bottom line the version label sits.
const VERSION_BOTTOM_MARGIN: u16 = 1;

/// Total height the layout reserves for the textbox, in cells, including
/// borders AND padding. This is the MAXIMUM the textbox will ever be; the
/// actual rendered height shrinks when there's less content.
/// Formula: MAX_INPUT_ROWS (content) + 2 (borders) + 2 * INPUT_PADDING (top+bottom padding).
const INPUT_BOX_MAX_HEIGHT: u16 = (MAX_INPUT_ROWS as u16) + 2 + INPUT_PADDING * 2;

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
/// "computed the same thing twice" problem.
pub struct FrameLayout {
    /// The full screen area.
    pub screen: Rect,
    /// The vertical center of the screen (where the title/textbox live).
    /// `[0]` title, `[1]` gap, `[2]` input, `[3]` model.
    pub middle_rows: std::rc::Rc<[Rect]>,
    /// The textbox column area: `[0]` left margin, `[1]` textbox, `[2]` right margin.
    /// Computed against the textbox row only.
    pub input_columns: std::rc::Rc<[Rect]>,
    /// The model line column area: same proportions as `input_columns`,
    /// but computed against the model row. This puts the model BELOW the
    /// textbox and aligned with it.
    pub model_columns: std::rc::Rc<[Rect]>,
}

impl FrameLayout {
    /// Computes the layout for a frame.
    pub fn compute(area: Rect) -> Self {
        // Total height of the content band: title + gap + input (max) + model.
        // Recomputed from the constants so changing them keeps this in sync.
        let content_band_height = 7 + 1 + INPUT_BOX_MAX_HEIGHT + 1;

        // The middle band: top spacer / content / bottom spacer.
        let middle_rows = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(1),
                Constraint::Length(content_band_height),
                Constraint::Min(1),
            ])
            .split(area);

        // Inside the middle band: title / gap / input / model.
        let content_rows = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(7),   // title
                Constraint::Length(1),   // gap
                Constraint::Length(INPUT_BOX_MAX_HEIGHT), // textbox (max)
                Constraint::Length(1),   // model line
            ])
            .split(middle_rows[1]);

        // The textbox column: 1/8 margin / 6/8 box / 1/8 margin.
        let input_columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Ratio(1, 8),
                Constraint::Ratio(6, 8),
                Constraint::Ratio(1, 8),
            ])
            .split(content_rows[2]);

        // The model line column: same proportions, but computed against
        // the model row, so the model line sits BELOW the textbox.
        let model_columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Ratio(1, 8),
                Constraint::Ratio(6, 8),
                Constraint::Ratio(1, 8),
            ])
            .split(content_rows[3]);

        Self {
            screen: area,
            middle_rows: content_rows,
            input_columns,
            model_columns,
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
    let lines: Vec<Line> = KUFU_ART
        .lines()
        .skip(1)
        .map(|line| {
            Line::from(Span::styled(
                line,
                Style::default()
                    .fg(theme::ACCENT)
                    .add_modifier(Modifier::BOLD),
            ))
        })
        .collect();

    let paragraph = Paragraph::new(lines)
        .alignment(Alignment::Center)
        .style(Style::default().bg(theme::BG));

    f.render_widget(paragraph, area);
}

/// Draws the model info row ("model X | ctx: 128k").
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

/// Draws the "pre-alpha" label in the bottom-right of the whole screen.
pub fn draw_version(f: &mut Frame, layout: &FrameLayout) {
    let bottom_row = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),
            Constraint::Length(VERSION_RIGHT_MARGIN),
            Constraint::Length(1),
        ])
        .split(layout.screen)[1];

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

/// Draws the textbox. Also serves as the "view controller" for the textbox:
/// it computes the per-frame `TextLayout` and the input widget's visible
/// portion.
///
/// Up/Down navigation is computed in `nav_key_to_byte` (called from the
/// main loop) BEFORE this draw is invoked, so the layout we compute here
/// already reflects the new cursor position.
pub fn draw_input(
    f: &mut Frame,
    state: &AppState,
    layout: &FrameLayout,
    view: &mut TextInputView,
) {
    let box_outer = layout.input_columns[1];

    // Step 1: decide how many content rows the textbox actually needs.
    // The layout reserves room for `MAX_INPUT_ROWS` content rows, but the
    // outer box shrinks when there's less content. This gives the
    // ChatGPT-style "grows as you type" behavior.
    //
    // We can't know the visual line count until we compute the layout, so
    // we compute a temporary layout at the MAX width to count lines.
    // The temporary layout is cheap; this is per-frame.
    let max_content_width = (box_outer.width.saturating_sub(2))
        .saturating_sub(INPUT_PADDING * 2)
        .saturating_sub(1) as usize;
    let probe_layout = TextLayout::compute(&state.input.buffer, max_content_width, state.input.cursor);
    let needed_rows = probe_layout.lines.len().clamp(MIN_INPUT_ROWS, MAX_INPUT_ROWS);
    // The box's total height has to fit:
    //   - 1 row for the top border
    //   - INPUT_PADDING rows of top padding
    //   - `needed_rows` rows of content
    //   - INPUT_PADDING rows of bottom padding
    //   - 1 row for the bottom border
    // Without this, the content area inside the box has zero height and
    // nothing is rendered, which is the "I can't type" bug.
    let needed_box_height = needed_rows as u16 + 2 + INPUT_PADDING * 2;

    // Step 2: re-split the input column to get the actually-used height.
    // We do this by splitting `box_outer` vertically: top is what we use,
    // bottom is empty space that we leave blank.
    let box_split = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(needed_box_height),
            Constraint::Min(0),
        ])
        .split(box_outer);
    let box_area = box_split[0];

    // Step 3: compute the FINAL layout at the actual content width.
    let content_width = (box_area.width.saturating_sub(2))
        .saturating_sub(INPUT_PADDING * 2)
        .saturating_sub(1) as usize;
    let text_layout = TextLayout::compute(&state.input.buffer, content_width, state.input.cursor);

    // Step 4: paint the box border and surface.
    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme::BORDER))
        .style(Style::default().bg(theme::SURFACE));
    f.render_widget(block, box_area);

    // Step 5: the content area inside the box, with padding on all four sides.
    let content_area = Rect {
        x: box_area.x + 1 + INPUT_PADDING,
        y: box_area.y + 1 + INPUT_PADDING,
        width: box_area.width.saturating_sub(2).saturating_sub(INPUT_PADDING * 2),
        height: box_area.height.saturating_sub(2).saturating_sub(INPUT_PADDING * 2),
    };

    let visible_rows = content_area.height as usize;
    view.clamp(text_layout.lines.len(), visible_rows);
    view.follow_cursor(&text_layout, visible_rows);

    if state.input.is_empty() {
        draw_placeholder(f, content_area, visible_rows);
    } else {
        draw_text(f, &text_layout, view, &state.input.buffer, content_area, visible_rows);
        set_text_cursor(f, &text_layout, view, content_area);
    }
}

/// Draws the centered placeholder inside an empty textbox.
fn draw_placeholder(f: &mut Frame, content: Rect, visible_rows: usize) {
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
    layout: &TextLayout,
    view: &TextInputView,
    buffer: &str,
    content: Rect,
    visible_rows: usize,
) {
    // Slice the lines according to the current scroll position.
    let start = view.scroll_top;
    let end = (start + visible_rows).min(layout.lines.len());

    // start..end computes for us the range of visible lines
    let lines: Vec<Line> = layout.lines[start..end]
        .iter()
        .map(|line| {
            // `line.text(buffer)` returns the slice for this visual line.
            Line::from(Span::styled(line.text(buffer), Style::default().fg(theme::TEXT)))
        })
        .collect();

    f.render_widget(Paragraph::new(lines), content);
}

/// Tells ratatui where the real terminal cursor should be drawn.
/// The cursor is placed at the cursor's visual position, offset by the
/// current scroll. `content` is the inner area WITH padding applied.
fn set_text_cursor(
    f: &mut Frame,
    layout: &TextLayout,
    view: &TextInputView,
    content: Rect,
) {
    let visible_line = layout.cursor.line.saturating_sub(view.scroll_top);

    let cursor_x = content.x + layout.cursor.column as u16;
    let cursor_y = content.y + visible_line as u16;

    if cursor_x < content.x + content.width && cursor_y < content.y + content.height {
        f.set_cursor_position((cursor_x, cursor_y));
    }
}

// ---------------------------------------------------------------------------
// Key routing for Up/Down - kept here because it depends on the layout.
// ---------------------------------------------------------------------------

/// Computes the new byte cursor after Up/Down, given the current layout.
/// Returns `None` for keys we don't handle here, so the caller can fall
/// through to the textbox's own key handler.
pub fn nav_key_to_byte(layout: &TextLayout, buffer: &str, key: KeyCode, byte_cursor: usize) -> Option<usize> {
    match key {
        KeyCode::Up => Some(layout.cursor_up(buffer, byte_cursor)),
        KeyCode::Down => Some(layout.cursor_down(buffer, byte_cursor)),
        _ => None,
    }
}
