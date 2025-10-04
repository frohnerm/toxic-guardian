// background/service_worker.js  (MV3, type: "module")

// --- Abort previous scan when navigation starts (top frame) ---
chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, url, frameId }) => {
  if (frameId !== 0) return; // only top-level
  const st = tabState.get(tabId);
  if (st?.inProgress) {
    sendToTab(tabId, { type: "CANCEL_SCAN", runId: st.lastRunId });
    st.inProgress = false;
    tabState.set(tabId, st);
  }
  // clear badge early
  chrome.action.setBadgeText({ tabId, text: "" });
});

// --- Re-scan after navigation completes or SPA route updates ---
chrome.webNavigation.onCompleted.addListener(({ tabId, url, frameId }) => {
  if (frameId !== 0) return;
  if (canScan(url)) maybeStartScan(tabId, url);
});
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url, frameId }) => {
  if (frameId !== 0) return;
  if (canScan(url)) maybeStartScan(tabId, url);
});

// --- Also scan when user activates a different tab (current page must be scanned) ---
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab?.id && canScan(tab.url)) maybeStartScan(tab.id, tab.url);
  });
});

// --- Optional: when a tab starts loading via tabs API, cancel the old scan ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    const st = tabState.get(tabId);
    if (st?.inProgress) {
      sendToTab(tabId, { type: "CANCEL_SCAN", runId: st.lastRunId });
      st.inProgress = false;
      tabState.set(tabId, st);
      chrome.action.setBadgeText({ tabId, text: "" });
    }
  }
});

// --- State -------------------------------------------------------
const tabState = new Map(); // tabId -> { url, inProgress, lastRunId, lastScanAt, last }

// --- Utils -------------------------------------------------------
function canScan(url = "") { return /^(https?:|file:)/i.test(url); }
async function sendToTab(tabId, msg) { try { await chrome.tabs.sendMessage(tabId, msg); } catch {} }

function maybeStartScan(tabId, url) {
  if (!canScan(url)) return;
  const st = tabState.get(tabId) || {};
  if (st.inProgress) return;
  if (st.url === url && st.lastScanAt && (Date.now() - st.lastScanAt) < 2000) return;
  st.url = url;
  st.inProgress = true;
  st.lastRunId = (st.lastRunId || 0) + 1;
  tabState.set(tabId, st);
  sendToTab(tabId, { type: "RUN_SCAN" });
}

// --- Context menu (optional) ------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "scanPageToxicity", title: "Scan page for toxic content", contexts: ["page"] });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "scanPageToxicity" && tab?.id && canScan(tab.url)) maybeStartScan(tab.id, tab.url);
});

// --- Navigation triggers (Background steuert Autostart) ----------
chrome.webNavigation.onCompleted.addListener(({ tabId, url }) => { if (canScan(url)) maybeStartScan(tabId, url); });
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url }) => { if (canScan(url)) maybeStartScan(tabId, url); });
chrome.tabs.onRemoved.addListener((tabId) => { tabState.delete(tabId); });

// --- Messaging ---------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handshake: Content Script erfragt seine tabId
  if (msg?.type === "CS_HELLO") {
    sendResponse?.({ ok: true, tabId: sender?.tab?.id ?? null });
    return;
  }

  // Fortschritt vom Content Script
  if (msg?.type === "SCAN_PROGRESS") {
    const tabId = (typeof msg.tabId === "number") ? msg.tabId : sender?.tab?.id;
    if (tabId != null) {
      const st = tabState.get(tabId) || {};
      st.inProgress = (msg.state === "start" || msg.state === "running" || msg.state === "finishing");
      if (msg.state === "done" || msg.state === "aborted" || msg.state === "error") {
        st.inProgress = false;
        st.lastScanAt = Date.now();
      }
      st.last = msg;
      tabState.set(tabId, st);

      // optional Badge: Trefferzahl bei "done"
      if (msg.state === "done") {
        const badge = (msg?.hits ? String(msg.hits) : "");
        chrome.action.setBadgeText({ tabId, text: badge });
        if (badge) chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" });
      }
    }

    // an Popup broadcasten
    chrome.runtime.sendMessage({ type: "SCAN_PROGRESS_BROADCAST", tabId, data: msg }).catch(()=>{});
    sendResponse?.({ ok: true });
    return; // kein async
  }

  // Popup: aktiven Tab scannen
  if (msg?.type === "RUN_SCAN_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => { if (tab?.id) maybeStartScan(tab.id, tab.url); });
    sendResponse?.({ ok: true });
    return;
  }

  // Popup: Status des aktiven Tabs
  if (msg?.type === "GET_STATUS_FOR_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      const st = tab ? tabState.get(tab.id) : null;
      sendResponse?.({ ok: true, tabId: tab?.id ?? null, status: st ?? null });
    });
    return true; // async
  }

  // Popup: Scan abbrechen
  if (msg?.type === "CANCEL_ACTIVE_SCAN") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        const st = tabState.get(tab.id);
        sendToTab(tab.id, { type: "CANCEL_SCAN", runId: st?.lastRunId });
      }
    });
    sendResponse?.({ ok: true });
    return;
  }
});
