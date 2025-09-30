chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "scanPageToxicity",
    title: "Scan page for toxic content",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "scanPageToxicity" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "RUN_SCAN" });
  }
});

// Allow popup to trigger scans
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "RUN_SCAN_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "RUN_SCAN" });
    });
  }
  sendResponse?.({ ok: true });
});
