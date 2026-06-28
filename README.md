# WhatsApp Web Desktop

A lightweight, native WhatsApp Web wrapper built with Electron for **Windows** and **Linux**.

## Features

* System tray support
* Close-to-tray behavior
* Native desktop notifications
* Start on login (Windows)
* Downloads automatically saved to the Downloads folder
* External links open in your default browser
* Single-instance application (re-launching focuses the existing window)
* Lightweight standalone desktop application

---

## Installation

### Windows

1. Download the latest **`.exe` installer** from the **Releases** page.
2. Run the installer and follow the setup wizard.
3. Launch **WhatsApp Web Desktop** from the Start Menu or Desktop shortcut.

---

### Linux

#### Ubuntu / Debian

Download the latest **`.deb`** package from the **Releases** page and install it:

```bash
sudo dpkg -i whatsapp-web-desktop_<version>_amd64.deb
sudo apt-get install -f
```

#### AppImage

Download the latest **`.AppImage`**, make it executable, and run:

```bash
chmod +x WhatsApp.Web.Desktop-<version>.AppImage
./WhatsApp.Web.Desktop-<version>.AppImage
```

---

## Build from Source

Clone the repository:

```bash
git clone https://github.com/Rudraksh919/whatsapp-web-desktop.git
cd whatsapp-web-desktop
```

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm start
```

Build for your current platform:

```bash
npm run dist
```

The generated installer/package will be available in the `dist/` directory.

---

## Downloads

Download the latest version from the **Releases** page.

| Platform | Package             |
| -------- | ------------------- |
| Windows  | `.exe`              |
| Linux    | `.deb`, `.AppImage` |
