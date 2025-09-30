const scanBtn = document.getElementById("scanBtn");
const statusEl = document.getElementById("status");
const openOptions = document.getElementById("openOptions");

statusEl.textContent = "Auto-scan on page load is enabled.";


scanBtn.addEventListener("click", () => {
  statusEl.textContent = "Scanning…";
  chrome.runtime.sendMessage({ type: "RUN_SCAN_ACTIVE_TAB" });
});

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SCAN_DONE") {
    statusEl.textContent = `Scan complete. Found ${msg.count} potential hit(s).`;
  }
});
