// main.rs - Kufu TUI Entry Point
//
// This is our main application file. In Rust, the `main` function is the
// entry point - similar to other languages like C, Go, or Java.

// `mod` declares a module. Think of modules like files/namespaces.
// We'll create these files next to organize our code.
mod theme;
mod ui;

// `use` brings items into scope, similar to `import` in other languages.
// std::io provides I/O traits we need for terminal operations.
// :: is used to access elements in a module, type or namespace
use std::io;

// crossterm::event provides keyboard/mouse event handling
use crossterm::event::{self, Event, KeyCode, KeyEventKind};

// ratatui provides the TUI framework
// The use keyword is employed to shorten the path required to refer to a module item
use ratatui::{
    // backend provides interaction with the terminal
    // The CrosstermBackend struct is a wrapper around a writer implementing Write, which is used to send commands to the terminal. It provides methods for drawing content, manipulating the cursor, and clearing the terminal screen.
    backend::CrosstermBackend,
    // Terminal is the main entry point for drawing to the screen
    Terminal,
};

// crossterm::terminal provides functions to setup/restore the terminal
// Crossterm is a pure-rust, terminal manipulation library that makes it possible to write cross-platform text-based interfaces.
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
// crossterm::execute lets us queue multiple terminal commands
use crossterm::execute;

// `struct` defines a custom data type with named fields.
// Similar to a class with properties (but no inheritance in Rust).
struct AppState {
    // The text the user is typing into the input box
    input: String,
    // Whether the application should exit
    should_quit: bool,
}

// `impl` block defines methods for our struct.
// Think of it like adding methods to a class.
// Implementing functions to a struct
impl AppState {
    // `new` is a Rust convention for constructors.
    // The arrow `-> AppState` is the return type.
    fn new() -> Self {
        // `Self` is an alias for the type we're implementing on (AppState).
        // Rust doesn't have constructors - we just create the struct directly.
        Self {
            input: String::new(),
            should_quit: false,
        }
    }
}

// The main function returns `io::Result<()>`.
// `Result` is Rust's way of handling errors - it can be Ok(value) or Err(error).
// `()` is the "unit type" - Rust's equivalent of void (meaning nothing).
fn main() -> io::Result<()> {
    // `enable_raw_mode()` puts the terminal into raw mode.
    // Normal terminal mode buffers input until Enter is pressed.
    // Raw mode gives us every keypress immediately (needed for a TUI).
    enable_raw_mode()?;

    // `io::stdout()` gives us a handle to standard output.
    // We need this to send commands to the terminal.
    let mut stdout = io::stdout();

    // `execute!` macro sends terminal escape sequences.
    // EnterAlternateScreen switches to a clean screen buffer
    // (like vim does - your previous terminal content is preserved).
    // The ? propagates errors (if the command fails, the program exits with an error).
    execute!(stdout, EnterAlternateScreen)?;

    // Create the terminal backend using crossterm.
    // `CrosstermBackend<io::Stdout>` means: use crossterm to draw to stdout.
    let backend = CrosstermBackend::new(stdout);

    // `Terminal::new()` creates our terminal abstraction.
    // The `?` operator propagates errors - if this fails, main returns the error.
    let mut terminal = Terminal::new(backend)?;

    // Create our application state
    let mut state = AppState::new();

    // Main event loop - this runs until the user quits
    loop {
        // `terminal.draw()` takes a closure (anonymous function) that receives
        // a mutable reference to a `Frame`. The closure is where we define
        // what to render.
        //
        // The `|f|` syntax is like an arrow function in JS: (f) => { ... }
        // `&mut` means we're borrowing `f` mutably - we can modify it.
        terminal.draw(|f| {
            // Call our UI rendering function from the ui module
            ui::draw(f, &state);
        })?;

        // `event::poll()` checks if there's a keyboard event waiting.
        // `Duration::from_millis(100)` means we wait up to 100ms.
        // This prevents the loop from spinning at 100% CPU.
        if event::poll(std::time::Duration::from_millis(100))? {
            // `event::read()` actually reads the event.
            if let Event::Key(key) = event::read()? {
                // KeyEventKind::Press ensures we only handle key presses,
                // not releases (on Windows, both events fire)
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        // KeyCode::Esc represents the Escape key
                        KeyCode::Esc => {
                            state.should_quit = true;
                        }
                        // KeyCode::Char represents a character key
                        KeyCode::Char(c) => {
                            // `push()` adds a character to our input string
                            state.input.push(c);
                        }
                        // KeyCode::Backspace deletes the last character
                        KeyCode::Backspace => {
                            // `pop()` removes and returns the last character
                            state.input.pop();
                        }
                        // `_` is the wildcard pattern - matches anything else
                        // We ignore other keys for now
                        _ => {}
                    }
                }
            }
        }

        // Check if we should exit the loop
        if state.should_quit {
            break;
        }
    }

    // Cleanup: restore the terminal to its original state.
    // This is crucial - if we don't do this, the terminal will be broken
    // after the program exits.
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;

    // `Ok(())` means "success, returning nothing"
    Ok(())
}
