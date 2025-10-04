const els = {
  run: document.getElementById("run"),
  cancel: document.getElementById("cancel"),
  prev: document.getElementById("prev"),
  next: document.getElementById("next"),
  bar: document.getElementById("bar"),
  counts: document.getElementById("counts"),
  hits: document.getElementById("hits"),
  state: document.getElementById("state"),
  note: document.getElementById("note"),
};

// --- helpers to message the active tab content script ---
async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}
async function sendToActive(msg) {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  try { return await chrome.tabs.sendMessage(tabId, msg); } catch {}
}

// --- render status coming from the background ---
function pct(done,total){ return total? Math.min(100, Math.round(done/Math.max(1,total)*100)) : 0; }
function renderStatus(s) {
  const last = s?.last ?? null;
  const total = last?.total ?? 0;
  const done  = last?.done  ?? 0;
  const hits  = last?.hits  ?? 0;
  const state = last?.state ?? "ready";
  els.bar.style.width = pct(done,total) + "%";
  els.counts.textContent = `${done}/${total} · ${pct(done,total)}%`;
  els.hits.textContent = `${hits} hits`;     // informational only
  els.state.textContent = state;
}

function askStatus() {
  chrome.runtime.sendMessage({ type:"GET_STATUS_FOR_ACTIVE_TAB" }, (res) => {
    if (!res?.ok) return;
    renderStatus(res.status);
    els.note.textContent = res.tabId ? "" : "Open a normal web page.";
  });
}

// --- actions ---
els.run.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type:"RUN_SCAN_ACTIVE_TAB" }, ()=>{});
  els.state.textContent = "starting…";
});
els.cancel.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type:"CANCEL_ACTIVE_SCAN" }, ()=>{});
});

// --- navigation buttons (primary way to move through matches) ---
els.next.addEventListener("click", async () => {
  await sendToActive({ type: "NEXT_TOXIC" });
});
els.prev.addEventListener("click", async () => {
  await sendToActive({ type: "PREV_TOXIC" });
});

// --- optional: arrow keys while popup is open (Left/Right) ---
window.addEventListener("keydown", async (e) => {
  if (e.key === "ArrowRight") await sendToActive({ type: "NEXT_TOXIC" });
  if (e.key === "ArrowLeft")  await sendToActive({ type: "PREV_TOXIC" });
});

// --- listen for progress updates from background ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SCAN_PROGRESS_BROADCAST") askStatus();
});

askStatus();
