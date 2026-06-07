// theme.rs - Color Theme Definition
//
// This module defines our color palette inspired by Catppuccin Mocha
// (a popular dark theme) and GitHub's dark mode.
//
// In ratatui, colors are represented by the `Color` enum.
// We use RGB colors (Red, Green, Blue) where each value is 0-255.

use ratatui::style::Color;

// Catppuccin Mocha palette (dark variant)
// These are the base colors we'll use throughout the TUI.

/// The main background color - a very dark blue/gray
/// Catppuccin calls this "Base" (#1e1e2e)
pub const BG: Color = Color::Rgb(30, 30, 46);

/// Slightly lighter background for elevated surfaces
/// Catppuccin "Surface0" (#313244)
pub const SURFACE: Color = Color::Rgb(49, 50, 68);

/// Even lighter surface for hover/active states
/// Catppuccin "Surface1" (#45475a)
pub const SURFACE_HOVER: Color = Color::Rgb(69, 71, 90);

/// Main text color - light gray/white
/// Catppuccin "Text" (#cdd6f4)
pub const TEXT: Color = Color::Rgb(205, 214, 244);

/// Secondary text - slightly dimmer
/// Catppuccin "Subtext0" (#a6adc8)
pub const TEXT_DIM: Color = Color::Rgb(166, 173, 200);

/// Accent color - soft blue (similar to GitHub's accent)
/// Catppuccin "Blue" (#89b4fa)
pub const ACCENT: Color = Color::Rgb(137, 180, 250);

/// Secondary accent - soft purple/mauve
/// Catppuccin "Mauve" (#cba6f7)
pub const ACCENT_ALT: Color = Color::Rgb(203, 166, 247);

/// Placeholder text color - very dim
/// Catppuccin "Overlay0" (#6c7086)
pub const PLACEHOLDER: Color = Color::Rgb(108, 112, 134);

/// Border color for widgets
/// Catppuccin "Surface2" (#585b70)
pub const BORDER: Color = Color::Rgb(88, 91, 112);

/// Border color when widget is focused/selected
/// Catppuccin "Lavender" (#b4befe)
pub const BORDER_FOCUSED: Color = Color::Rgb(180, 190, 254);
