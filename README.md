# WhatsApp Web Desktop

WhatsApp Web in a small native window. This branch is a **Tauri v2 (Rust) + WebView2** port for **Windows**: no bundled Chromium, no Node.js process, ~1.5 MB installer.

## Features

- Privacy blur toggle for the chat list, plus an "Open Downloads" button
- System tray (left-click opens, right-click menu), close-to-tray
- Native Windows toasts; clicking one (even from the Action Center) brings the app back
- Unread count on the taskbar icon and tray
- Memory trim while hidden in the tray (WebView2 `MemoryUsageTargetLevel = Low`)
- Downloads go to your Downloads folder (`name (1).ext` on duplicates)
- External links open in your default browser; single instance

## Build

Needs Rust and the MSVC build tools.

```bash
cargo install tauri-cli --version "^2" --locked
cd src-tauri
cargo tauri dev      # run
cargo tauri build    # installer -> src-tauri/target/release/bundle/nsis/
```

Icon source is `src-tauri/icons/icon.svg`; regenerate the rest with `cargo tauri icon icons/icon.svg`.
