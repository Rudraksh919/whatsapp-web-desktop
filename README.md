# WhatsApp Web Desktop

WhatsApp Web wrapper built with Electron. Runs on **Windows** and **Linux**.

## Features

- System tray icon (single-click to open, right-click menu)
- Close-to-tray (app keeps running in the background)
- Native desktop notifications (click to focus the chat)
- "Start on login" toggle (starts hidden in the tray)
- Downloads saved to `Downloads/`
- External links open in your default browser
- Single-instance (re-launching focuses the existing window)

## Install

### Windows

Download the latest `${name}-${version}-setup.exe` (e.g. `whatsapp-web-desktop-setup-1.0.4.exe`) from
[Releases](https://github.com/Rudraksh919/whatsapp-linux/releases) and run it.
The NSIS installer lets you choose the install folder and creates Desktop and
Start Menu shortcuts.

### Linux

Download the latest `.deb` from
[Releases](https://github.com/Rudraksh919/whatsapp-linux/releases) and install:

```bash
sudo dpkg -i ./whatsapp-web-desktop_1.0.2_amd64.deb
sudo apt-get install -f
```

(An `AppImage` is also produced for distro-independent use.)

## Build from source

```bash
npm install

# Windows installer (Setup .exe) -> dist/
npm run dist:win

# Linux packages (.deb + AppImage) -> dist/
npm run dist
```

Run in development:

```bash
npm start
```
