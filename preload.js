const { contextBridge, ipcRenderer, webFrame } = require("electron");

// Expose a small API for any renderer scripts we control (unused by WhatsApp).
contextBridge.exposeInMainWorld("electronAPI", {
  notify: (title, body) => ipcRenderer.send("notify", { title, body }),
});

// The page's main world forwards notifications to us via a DOM CustomEvent
// (the DOM is shared across isolated/main worlds). We relay them to the main
// process, which shows a native notification whose click re-opens the window.
window.addEventListener("wa-native-notify", (e) => {
  const d = (e && e.detail) || {};
  ipcRenderer.send("notify", {
    title: d.title || "WhatsApp",
    body: d.body || "",
  });
});

// With contextIsolation enabled, overriding window.Notification in this preload
// would only affect the isolated world and never reach WhatsApp's own code.
// webFrame.executeJavaScript runs in the page's MAIN world (and bypasses the
// page CSP), so the override below actually takes effect on WhatsApp's scripts.
const mainWorldPatch = function () {
  try {
    const forward = function (title, opts) {
      try {
        window.dispatchEvent(
          new CustomEvent("wa-native-notify", {
            detail: {
              title: String(title || ""),
              body: opts && opts.body ? String(opts.body) : "",
            },
          })
        );
      } catch (e) {
        // ignore
      }
    };

    // A stub so the page keeps working while we suppress the duplicate
    // browser-rendered notification (whose click can't un-hide the tray window).
    const makeStub = function () {
      return {
        onclick: null,
        onclose: null,
        onerror: null,
        onshow: null,
        close: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {
          return false;
        },
      };
    };

    const Orig = window.Notification;
    if (Orig) {
      function ProxyNotification(title, opts) {
        forward(title, opts);
        return makeStub();
      }
      try {
        ProxyNotification.requestPermission = Orig.requestPermission.bind(Orig);
      } catch (e) {}
      try {
        Object.defineProperty(ProxyNotification, "permission", {
          get: function () {
            return Orig.permission;
          },
        });
      } catch (e) {
        ProxyNotification.permission = Orig.permission;
      }
      window.Notification = ProxyNotification;
    }

    // WhatsApp also shows notifications via the service worker registration while
    // the app is running. Override that too so those clicks open the app.
    if (
      window.ServiceWorkerRegistration &&
      ServiceWorkerRegistration.prototype &&
      ServiceWorkerRegistration.prototype.showNotification
    ) {
      ServiceWorkerRegistration.prototype.showNotification = function (
        title,
        opts
      ) {
        forward(title, opts);
        return Promise.resolve();
      };
    }
  } catch (e) {
    // ignore
  }
};

webFrame.executeJavaScript("(" + mainWorldPatch.toString() + ")();");
