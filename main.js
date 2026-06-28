const fs = require("fs");
const path = require("path");
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  Notification,
  ipcMain,
  shell,
  session,
} = require("electron");

Menu.setApplicationMenu(null);

const isWindows = process.platform === "win32";
const APP_ID = "com.whatsapp.web.desktop";

// Custom URI scheme used for notification activation. Clicking a toast from the
// Windows notification panel (Action Center) launches this URI, which re-opens
// the app even when it was sitting in the tray or fully closed.
const PROTOCOL = "whatsapp-webapp";

// On Windows this is required so notifications show the correct app name/icon
// (otherwise they appear as "electron.app.<id>" and may be silently dropped).
if (isWindows) {
  app.setAppUserModelId(APP_ID);
}

// Register ourselves as the handler for the PROTOCOL:// scheme.
if (process.defaultApp) {
  // Running unpackaged (electron .) — point the scheme at this electron binary.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const WHATSAPP_URL = "https://web.whatsapp.com/";
let mainWindow = null;
let tray = null;

// Disable GPU only on Linux (avoids MESA-LOADER errors on Nvidia).
// On Windows the GPU is fine and disabling it can cause black-screen issues.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("disable-gpu");
}

// Resolve the user's Downloads folder in a cross-platform way and save
// everything from the app there directly.
function getDownloadDir() {
  let dir;
  try {
    dir = app.getPath("downloads");
  } catch (e) {
    dir = path.join(app.getPath("home"), "Downloads");
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Bring the main window to the foreground, creating/un-hiding it as needed.
function revealWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  // On Windows, briefly pinning always-on-top reliably pulls the window to the
  // foreground from the tray; otherwise it can stay behind other apps.
  if (isWindows) {
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setAlwaysOnTop(false);
  }
  mainWindow.focus();
}

// Minimal XML escaping for values injected into the toast template.
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    show: false,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Spoof a desktop Chrome user agent matching the host platform so WhatsApp
  // Web serves the full desktop experience.
  const ua = isWindows
    ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  mainWindow.webContents.setUserAgent(ua);

  mainWindow.loadURL(WHATSAPP_URL);

  // Open any popup (new window) link in the default browser instead of in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Keep WhatsApp navigation in-app, send every other link to the browser.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(WHATSAPP_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Intercept close → hide to tray instead of quitting.
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // A second launch (including a PROTOCOL:// notification activation from the
  // Action Center) lands here in the already-running instance — reveal the app.
  app.on("second-instance", () => {
    revealWindow();
  });
}

function isAutoLaunchEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}

function setAutoLaunch(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // Start hidden in the tray on login rather than popping the window open.
    openAsHidden: true,
    args: ["--hidden"],
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Open WhatsApp",
      click: () => {
        if (!mainWindow) createWindow();
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: "separator" },
    {
      label: "Start on login",
      type: "checkbox",
      checked: isAutoLaunchEnabled(),
      click: (item) => {
        setAutoLaunch(item.checked);
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
}

app.on("ready", () => {
  // Tray — load the app icon and resize it down for a crisp tray glyph.
  const iconPath = path.join(__dirname, "assets", "icon.png");
  let trayImg;
  try {
    trayImg = nativeImage.createFromPath(iconPath);
    if (!trayImg.isEmpty()) {
      trayImg = trayImg.resize({ width: 16, height: 16 });
    }
  } catch (e) {
    trayImg = nativeImage.createEmpty();
  }
  tray = new Tray(trayImg);
  tray.setToolTip("WhatsApp Web");
  tray.setContextMenu(buildTrayMenu());

  // On Windows, a single click on the tray icon shows the window.
  tray.on("click", () => {
    if (!mainWindow) createWindow();
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });

  createWindow();

  // If launched at login (--hidden), start minimized to the tray.
  const launchedHidden =
    process.argv.includes("--hidden") ||
    app.getLoginItemSettings().wasOpenedAsHidden;
  if (launchedHidden && mainWindow) {
    mainWindow.once("ready-to-show", () => mainWindow.hide());
  }

  // Save every download into the user's Downloads folder.
  const downloadDir = getDownloadDir();
  session.defaultSession.on("will-download", (event, item) => {
    const filePath = path.join(downloadDir, item.getFilename());

    // If the file already exists, just open it instead of re-downloading.
    if (fs.existsSync(filePath)) {
      event.preventDefault();
      shell.openPath(filePath);
      return;
    }

    item.setSavePath(filePath);
    item.once("done", (e, state) => {
      if (state === "completed") {
        console.log("Download finished:", filePath);
      } else {
        console.log("Download failed:", state);
      }
    });
  });
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
  else mainWindow.show();
});

app.on("window-all-closed", () => {
  // Keep running in the tray on all platforms until "Quit" is chosen.
});

// Native notifications forwarded from the renderer/preload.
ipcMain.on("notify", (event, { title, body }) => {
  if (!Notification.isSupported()) return;

  const safeTitle = title || "WhatsApp";
  const safeBody = body || "";

  const options = {
    title: safeTitle,
    body: safeBody,
    icon: path.join(__dirname, "assets", "icon.png"),
  };

  // On Windows, route the toast through protocol activation so clicking it from
  // the notification panel (Action Center) — not just the live toast — re-opens
  // the app. Electron's plain "click" event only fires for the live toast.
  if (isWindows) {
    options.toastXml =
      `<toast activationType="protocol" launch="${PROTOCOL}://open">` +
      `<visual><binding template="ToastGeneric">` +
      `<text>${escapeXml(safeTitle)}</text>` +
      `<text>${escapeXml(safeBody)}</text>` +
      `</binding></visual></toast>`;
  }

  const notification = new Notification(options);
  // Fallback for the live-toast click on platforms where the event fires.
  notification.on("click", revealWindow);
  notification.show();
});
