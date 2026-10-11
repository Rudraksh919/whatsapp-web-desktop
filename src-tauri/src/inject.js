(() => {
  if (location.origin !== "https://web.whatsapp.com") return;
  const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args);

  // --- Native notifications ---
  // Runs inside the page itself, so we replace Notification directly and
  // forward to Rust, which shows a toast whose click re-opens the window.
  const forward = (title, o) =>
    invoke("notify", { title: String(title || "WhatsApp"), body: String((o && o.body) || "") }).catch(() => {});

  function N(title, opts) {
    forward(title, opts);
    return { onclick: null, onclose: null, onerror: null, onshow: null, close() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false };
  }
  N.permission = "granted";
  N.requestPermission = () => Promise.resolve("granted");
  window.Notification = N;
  if (window.ServiceWorkerRegistration) {
    ServiceWorkerRegistration.prototype.showNotification = (t, o) => (forward(t, o), Promise.resolve());
  }

  // --- Unread count: page title is "(3) WhatsApp" ---
  let lastUnread = -1;
  const syncUnread = () => {
    const m = /^\((\d+)\)/.exec(document.title);
    const n = m ? +m[1] : 0;
    if (n !== lastUnread) invoke("set_unread", { count: (lastUnread = n) }).catch(() => {});
  };
  window.addEventListener("load", () => {
    new MutationObserver(syncUnread).observe(document.querySelector("title") || document.head, {
      childList: true, subtree: true, characterData: true,
    });
    syncUnread();
  });

  // --- Privacy Blur Feature ---
  window.addEventListener('load', () => {
    // Inject CSS
    const style = document.createElement('style');
    style.id = 'privacy-extension-style';
    style.innerHTML = `
      /* Target the main chat list */
      body.privacy-mode #pane-side [role="row"]:not(:hover):has([data-testid="cell-frame-container"]):not(:has([aria-selected="true"])):not(:has([aria-current="page"])),
      
      /* Target dynamically tagged chat rows in side drawers (Archived, Search, etc.) */
      body.privacy-mode .is-chat-row:not(:hover):has([data-testid="cell-frame-container"]):not(:has([aria-selected="true"])):not(:has([aria-current="page"])) {
          filter: blur(6px) !important;
          opacity: 0.7 !important;
          transition: filter 0.2s ease, opacity 0.2s ease !important;
      }
  
      /* Fixed controls - isolated from React's DOM updates */
      #privacy-toggle-btn,
      #downloads-folder-btn {
          position: fixed !important;
          bottom: 120px !important;
          /* left is calculated dynamically in JS to match exact alignment */
          z-index: 999999 !important;
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 8px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background 0.2s;
          width: 40px;
          height: 40px;
      }
      #privacy-toggle-btn:hover,
      #downloads-folder-btn:hover {
          background: rgba(255, 255, 255, 0.08);
      }
      #privacy-toggle-btn svg,
      #downloads-folder-btn svg {
          width: 24px;
          height: 24px;
          fill: #aebac1;
      }
    `;
    document.head.appendChild(style);
  
    // Load state from localStorage
    let privacyEnabled = window.localStorage.getItem('privacy-mode-enabled') === 'true';
    if (privacyEnabled) {
      document.body.classList.add('privacy-mode');
    }
  
    function updateControls() {
      // Check if the main WhatsApp UI has actually loaded (avoids showing on loading screen)
      const settingsBtn = document.querySelector('[aria-label="Settings"]') || 
                          document.querySelector('[data-testid="settings-outline"]');
      const chatList = document.querySelector('div[aria-label="Chat list"]');
      
      if (!settingsBtn && !chatList) {
          const existingBtn = document.getElementById('privacy-toggle-btn');
          if (existingBtn) existingBtn.style.display = 'none';
        const existingDownloadsBtn = document.getElementById('downloads-folder-btn');
        if (existingDownloadsBtn) existingDownloadsBtn.style.display = 'none';
          return;
      }
  
      let btn = document.getElementById('privacy-toggle-btn');
      
      // Only create if not present
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'privacy-toggle-btn';
        btn.title = 'Toggle Privacy Mode';
        
        const eyeOpen = '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
        const eyeClosed = '<svg viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';
  
        btn.innerHTML = privacyEnabled ? eyeClosed : eyeOpen;
  
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent clicks from leaking
          privacyEnabled = !privacyEnabled;
          window.localStorage.setItem('privacy-mode-enabled', privacyEnabled);
          
          if (privacyEnabled) {
            document.body.classList.add('privacy-mode');
            btn.innerHTML = eyeClosed;
          } else {
            document.body.classList.remove('privacy-mode');
            btn.innerHTML = eyeOpen;
          }
        });
  
        // Append to body directly to avoid React wiping it and causing an infinite loop
        document.body.appendChild(btn);
      }
  
      let downloadsBtn = document.getElementById('downloads-folder-btn');
      if (!downloadsBtn) {
        downloadsBtn = document.createElement('button');
        downloadsBtn.id = 'downloads-folder-btn';
        downloadsBtn.title = 'Open Downloads Folder';
        downloadsBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zm10 14H4V8h16v10zm-8-2 4-4h-3V9h-2v3H8l4 4z"/></svg>';
        downloadsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.isTrusted) invoke('open_downloads');
        });
        document.body.appendChild(downloadsBtn);
      }
      
      // Ensure controls are visible (in case they were hidden during loading)
      btn.style.display = '';
      downloadsBtn.style.display = '';
  
      // Dynamically tag rows in side drawers (Archived, Search) so they blur, 
      // while explicitly ignoring Settings menus.
      if (document.body.classList.contains('privacy-mode')) {
          document.querySelectorAll('div:not(#main):not(#pane-side) [role="row"]').forEach(row => {
              // Find the overarching drawer container for this row
              let drawer = row.closest('div[tabindex="-1"], div[data-animate="true"], div[data-testid="drawer-left"]');
              
              // Fallback context finding
              if (!drawer) {
                  drawer = row.parentElement;
                  for (let i = 0; i < 4; i++) {
                      if (drawer && drawer.parentElement) drawer = drawer.parentElement;
                  }
              }
              
              if (drawer) {
                  // The title is always the first visible line of text in the drawer!
                  const firstLine = (drawer.innerText || '').split('\n')[0].toLowerCase();
                  
                  if (firstLine.includes('archive') || firstLine.includes('search') || firstLine.includes('new chat') || firstLine.includes('contact')) {
                      row.classList.add('is-chat-row');
                  } else {
                      row.classList.remove('is-chat-row');
                  }
              }
          });
      }
  
      // Dynamically align with the Settings button to ensure pixel-perfect centering
      if (settingsBtn) {
          // The element with aria-label is usually the clickable container.
          const rect = settingsBtn.getBoundingClientRect();
          if (rect.width > 0 && rect.top > 0) {
              // Find exact horizontal center of the settings icon
              const centerX = rect.left + (rect.width / 2);
              // Since our button is 40px wide, subtract 20px to perfectly center it
              btn.style.setProperty('left', (centerX - 20) + 'px', 'important');
              
              // Calculate exact vertical gap by looking at the distance to the next icon (Profile)
              let gap = 12; // default fallback gap
              const nextIcon = settingsBtn.nextElementSibling || (settingsBtn.parentElement && settingsBtn.parentElement.nextElementSibling);
              if (nextIcon) {
                  const nextRect = nextIcon.getBoundingClientRect();
                  if (nextRect.top > rect.bottom) {
                      gap = nextRect.top - rect.bottom;
                  }
              }
              
              // Position our button above the Settings button
              // Adjusted downwards by ~18px (approx 0.5cm) as requested
              const distanceFromBottom = window.innerHeight - rect.top;
              const privacyBottom = distanceFromBottom + gap - 18;
              btn.style.setProperty('bottom', privacyBottom + 'px', 'important');
              downloadsBtn.style.setProperty('left', (centerX - 20) + 'px', 'important');
              downloadsBtn.style.setProperty('bottom', (privacyBottom + 48) + 'px', 'important');
          }
      } else {
          // Fallback default alignment
          btn.style.setProperty('left', '12px', 'important');
          btn.style.setProperty('bottom', '100px', 'important');
            downloadsBtn.style.setProperty('left', '12px', 'important');
            downloadsBtn.style.setProperty('bottom', '148px', 'important');
      }
    }
  
    let updateTimer = null;
    function scheduleControlUpdate() {
      if (updateTimer) return;
      updateTimer = window.setTimeout(() => {
        updateTimer = null;
        updateControls();
      }, 150);
    }
  
    const observer = new MutationObserver(scheduleControlUpdate);
  
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleControlUpdate);
    scheduleControlUpdate();
  });
})();
