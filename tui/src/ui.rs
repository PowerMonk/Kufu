// ui.rs - User Interface Rendering
//
// This module handles all the visual rendering of the TUI.
// In ratatui, rendering happens in a "draw" function that receives
// a Frame. A Frame represents one screen of the terminal.

use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout, Alignment},
    widgets::{Block, Borders, Paragraph},
    style::{Modifier, Style},
    text::{Line, Span},
};

use crate::theme;
use crate::AppState;

/// ASCII art for "Kufu" - each string is one line of the art.
/// We use this to make the title "bigger" since terminals can't change font size.
/// This is a common technique in TUI and CLI apps.
/// &str means it's a string slice, a string slice is better for static text that doesn't need to be modified because it's more efficient than a String (which is heap-allocated and mutable).
const KUFU_ART: &str = r#"
 ██╗  ██╗██╗   ██╗███████╗██╗   ██╗
 ██║ ██╔╝██║   ██║██╔════╝██║   ██║
 █████╔╝ ██║   ██║█████╗  ██║   ██║
 ██╔═██╗ ██║   ██║██╔══╝  ██║   ██║
 ██║  ██╗╚██████╔╝██║     ╚██████╔╝
 ╚═╝  ╚═╝ ╚═════╝ ╚═╝      ╚═════╝
"#;

pub fn draw(f: &mut Frame, state: &AppState) {
    let area = f.area();

    // --- Paint the entire background first ---
    // This is the key fix: we render a Block covering the FULL screen area
    // with our background color BEFORE rendering anything else.
    // Widgets only color their own area, so without this, empty space stays black.
    let background = Block::default()
        .style(Style::default().bg(theme::BG));
    f.render_widget(background, area);

    // Split the screen vertically into 3 sections to center content.
    // The middle section holds our title + input box.
    let vertical_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),      // Top spacer
            Constraint::Length(12),  // Middle: title (7 lines) + gap + input (3 lines)
            Constraint::Min(1),      // Bottom spacer
        ])
        .split(area);

    // Split the middle section: title on top, input below
    let middle_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(7),   // ASCII art is 7 lines tall (including blank line)
            Constraint::Length(1),   // Small gap between title and input
            Constraint::Length(3),   // Input box (top border + content + bottom border)
        ])
        // [1] means we take the split where content goes
        .split(vertical_chunks[1]);

    // --- Draw the ASCII art title ---
    // KUFU_ART is a &str (string slice). We split it into lines with .lines().
    // Each line becomes a Line with our accent color.
    let title_lines: Vec<Line> = KUFU_ART
        .lines()
        .skip(1)  // Skip the first empty line from the raw string literal
        .map(|line| {
            // `map` transforms each element. Here we convert each &str into a styled Line.
            // `Span::styled` applies our accent color to the whole line.
            Line::from(Span::styled(
                line,
                Style::default()
                    .fg(theme::ACCENT)
                    .add_modifier(Modifier::BOLD),
            ))
        })
        .collect();  // `collect()` gathers the iterator into a Vec

    let title = Paragraph::new(title_lines)
        .alignment(Alignment::Center)
        .style(Style::default().bg(theme::BG));

    f.render_widget(title, middle_chunks[0]);

    // --- Draw the input box with side margins ---
    // Split the input row horizontally: left spacer / input / right spacer
    // Constraint::Ratio(n, d) takes n/d of the available space.
    // So Ratio(1, 6) = 1/6 of the width for each spacer.
    let input_row = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Ratio(1, 6),  // Left margin: 1/6 of screen
            Constraint::Ratio(4, 6),  // Input box: 4/6 of screen (the middle 2/3)
            Constraint::Ratio(1, 6),  // Right margin: 1/6 of screen
        ])
        // input box is the chunk number 2 (0-based index)
        .split(middle_chunks[2]);

    let input_block = Block::default()
        .title(" Input ")
        .title_style(Style::default().fg(theme::TEXT_DIM))
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme::BORDER))
        .style(Style::default().bg(theme::BG));

    let input_content = if state.input.is_empty() {
        Span::styled(
            "Kufu I need you to...",
            Style::default().fg(theme::PLACEHOLDER),
        )
    } else {
        Span::styled(&state.input, Style::default().fg(theme::TEXT))
    };

    let input_paragraph = Paragraph::new(Line::from(input_content))
        .block(input_block);

    // Render into input_row[1] (the middle section)
    f.render_widget(input_paragraph, input_row[1]);
}
