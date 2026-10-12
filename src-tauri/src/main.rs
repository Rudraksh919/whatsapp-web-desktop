#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{DownloadEvent, NewWindowResponse},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

const APP_ID: &str = "com.whatsapp.web.desktop";
const WA: &str = "https://web.whatsapp.com/";
const TRAY_ICON: &[u8] = include_bytes!("../icons/32x32.png");

fn main() {
    tauri::Builder::default()
        // Must be first. A second launch (or a whatsapp-webapp://open toast click)
        // lands here in the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| reveal(app)))
        .plugin(tauri_plugin_deep_link::init())
        // Our own on_new_window/on_navigation handlers open links; the plugin's click
        // interceptor would swallow target=_blank links (its IPC is blocked for remote pages).
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .invoke_handler(tauri::generate_handler![notify, set_unread, open_downloads])
        .setup(|app| {
            build_window(app.handle())?;
            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|w, e| {
            // Close → hide to tray; only the tray's Quit exits.
            if let WindowEvent::CloseRequested { api, .. } = e {
                api.prevent_close();
                let _ = w.hide();
                if let Some(win) = w.app_handle().get_webview_window("main") {
                    set_low_memory(&win, true);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run");
}

fn build_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let downloads = app.path().download_dir()?;
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(WA.parse().unwrap()))
        .title("WhatsApp")
        .inner_size(1100.0, 700.0)
        .initialization_script(include_str!("inject.js"))
        // Tauri swallows file drops on Windows by default; WhatsApp needs native HTML5 drag-and-drop.
        .disable_drag_drop_handler()
        // WhatsApp stays in-app; every other link goes to the default browser.
        .on_navigation(|url| {
            if url.origin().ascii_serialization() == "https://web.whatsapp.com" {
                return true;
            }
            open_external(url.as_str());
            false
        })
        .on_new_window(|url, _| {
            open_external(url.as_str());
            NewWindowResponse::Deny
        })
        .on_download(move |_, ev| {
            if let DownloadEvent::Requested { destination, .. } = ev {
                let name = destination.file_name().map(PathBuf::from).unwrap_or_else(|| "download".into());
                *destination = unique_path(&downloads, &name);
            }
            true
        })
        .build()
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open WhatsApp", true, None::<&str>)?;
    let reload = MenuItem::with_id(app, "reload", "Reload WhatsApp", true, None::<&str>)?;
    let dl = MenuItem::with_id(app, "dl", "Open Downloads Folder", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &reload, &dl, &PredefinedMenuItem::separator(app)?, &quit])?;

    TrayIconBuilder::with_id("tray")
        .icon(Image::from_bytes(TRAY_ICON)?)
        .tooltip("WhatsApp Web")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => reveal(app),
            "reload" => {
                reveal(app);
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.navigate(WA.parse().unwrap());
                }
            }
            "dl" => open_downloads(app.clone()),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                reveal(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn reveal(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        set_low_memory(&w, false);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// Ask WebView2 to release memory while hidden. The page keeps running, so
// notifications still arrive (unlike TrySuspend).
fn set_low_memory(w: &WebviewWindow, low: bool) {
    #[cfg(windows)]
    let _ = w.with_webview(move |pv| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows::core::Interface;
        if let Ok(core) = pv.controller().CoreWebView2() {
            if let Ok(c) = core.cast::<ICoreWebView2_19>() {
                let _ = c.SetMemoryUsageTargetLevel(if low {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                } else {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                });
            }
        }
    });
    #[cfg(not(windows))]
    let _ = (w, low);
}

#[tauri::command]
fn notify(title: String, body: String) {
    #[cfg(windows)]
    let _ = show_toast(&title, &body);
    #[cfg(not(windows))]
    let _ = (title, body);
}

#[tauri::command]
fn set_unread(app: AppHandle, count: u32) {
    if let Some(tray) = app.tray_by_id("tray") {
        let tip = if count > 0 { format!("WhatsApp Web ({count} unread)") } else { "WhatsApp Web".into() };
        let _ = tray.set_tooltip(Some(tip));
        let icon = Image::from_bytes(TRAY_ICON).unwrap();
        let _ = tray.set_icon(Some(if count > 0 { with_badge(&icon, count) } else { icon }));
    }
    #[cfg(windows)]
    if let Some(w) = app.get_webview_window("main") {
        let blank = Image::new_owned(vec![0; 32 * 32 * 4], 32, 32);
        let _ = w.set_overlay_icon((count > 0).then(|| with_badge(&blank, count)));
    }
}

#[tauri::command]
fn open_downloads(app: AppHandle) {
    if let Ok(dir) = app.path().download_dir() {
        let _ = tauri_plugin_opener::open_path(dir, None::<&str>);
    }
}

fn open_external(url: &str) {
    if url.starts_with("http://") || url.starts_with("https://") {
        let _ = tauri_plugin_opener::open_url(url, None::<&str>);
    }
}

fn unique_path(dir: &Path, name: &Path) -> PathBuf {
    let stem = name.file_stem().unwrap_or_default().to_string_lossy();
    let ext = name.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (0..)
        .map(|i| dir.join(if i == 0 { format!("{stem}{ext}") } else { format!("{stem} ({i}){ext}") }))
        .find(|p| !p.exists())
        .unwrap()
}

// Red circle with the unread count (or "9+") in the top-right of `base`.
// Drawn in code: no image assets, and crisp at any size.
fn with_badge(base: &Image<'_>, count: u32) -> Image<'static> {
    // 3x5 pixel font, row-major. Index 10 is '+'.
    const FONT: [&str; 11] = [
        "111101101101111", "010110010010111", "111001111100111", "111001111001111",
        "101101111001001", "111100111001111", "111100111101111", "111001001001001",
        "111101111101111", "111101111001111", "000010111010000",
    ];
    let (w, h) = (base.width() as i32, base.height() as i32);
    let mut px = base.rgba().to_vec();
    let r = w * 10 / 32 + 1;
    let (cx, cy) = (w - r, r);
    let glyphs: Vec<usize> = if count > 9 { vec![9, 10] } else { vec![count as usize] };
    let s = if glyphs.len() == 1 { (r * 12 / 10 / 5).max(1) } else { (r * 3 / 2 / 7).max(1) };
    let text_w = glyphs.len() as i32 * 4 * s - s;

    for y in 0..h {
        for x in 0..w {
            let (dx, dy) = (x - cx, y - cy);
            if dx * dx + dy * dy > r * r {
                continue;
            }
            // Position inside the text box, in font pixels.
            let (tx, ty) = (x - (cx - text_w / 2), y - (cy - 5 * s / 2));
            let lit = tx >= 0 && ty >= 0 && ty < 5 * s && tx < text_w && {
                let (g, gx) = ((tx / s) / 4, (tx / s) % 4);
                gx < 3 && FONT[glyphs[g as usize]].as_bytes()[(ty / s * 3 + gx) as usize] == b'1'
            };
            let i = ((y * w + x) * 4) as usize;
            px[i..i + 4].copy_from_slice(if lit { &[255, 255, 255, 255] } else { &[229, 57, 53, 255] });
        }
    }
    Image::new_owned(px, w as u32, h as u32)
}

// Same toast design as the Electron build: clicking it — even later from the
// Action Center — opens whatsapp-webapp://open, which reveals the window.
#[cfg(windows)]
fn show_toast(title: &str, body: &str) -> windows::core::Result<()> {
    use windows::{core::HSTRING, Data::Xml::Dom::XmlDocument, UI::Notifications::*};
    let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;");
    let xml = format!(
        r#"<toast activationType="protocol" launch="whatsapp-webapp://open"><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual></toast>"#,
        esc(title),
        esc(body)
    );
    let doc = XmlDocument::new()?;
    doc.LoadXml(&HSTRING::from(xml))?;
    let toast = ToastNotification::CreateToastNotification(&doc)?;
    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID))?.Show(&toast)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn badge_draws_red_and_white() {
        let base = Image::new_owned(vec![0; 32 * 32 * 4], 32, 32);
        for n in [3, 12] {
            let px = with_badge(&base, n).rgba().to_vec();
            assert!(px.chunks(4).any(|p| p == [229, 57, 53, 255]));
            assert!(px.chunks(4).any(|p| p == [255, 255, 255, 255]));
        }
    }

    #[test]
    fn unique_path_adds_suffix() {
        let dir = std::env::temp_dir().join("wa_unique_test");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), "").unwrap();
        assert_eq!(unique_path(&dir, Path::new("a.txt")), dir.join("a (1).txt"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
