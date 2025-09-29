const { contextBridge, ipcRenderer } = require('electron');


// Expose limited API to the web context (if you plan to inject). We won't inject into WhatsApp page,
// but this API is available to any renderer scripts you control.
contextBridge.exposeInMainWorld('electronAPI', {
notify: (title, body) => ipcRenderer.send('notify', { title, body })
});


// Optionally, intercept window.Notification to forward notifications to native notifications
// but be careful: WhatsApp Web handles its own notifications using the Notifications API.
// The following replaces the page Notification with a proxy that forwards to Electron.


(function () {
try {
const OrigNotify = window.Notification;
function ProxyNotification(title, opts) {
// Forward to host
try {
ipcRenderer.send('notify', { title: title, body: opts && opts.body ? opts.body : '' });
} catch (e) {
// ignore
}
// still call original so page's permission logic is preserved
return new OrigNotify(title, opts);
}
ProxyNotification.requestPermission = OrigNotify.requestPermission.bind(OrigNotify);
ProxyNotification.permission = OrigNotify.permission;
window.Notification = ProxyNotification;
} catch (e) {
// ignore (cross-origin or CSP)
}
})();