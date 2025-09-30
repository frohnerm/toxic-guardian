const modelFile = document.getElementById("modelFile");
const saveModel = document.getElementById("saveModel");
const keywordList = document.getElementById("keywordList");
const saveKeywords = document.getElementById("saveKeywords");
const thresholdInput = document.getElementById("threshold");
const saveThreshold = document.getElementById("saveThreshold");
const clearAll = document.getElementById("clearAll");

// Load existing settings
chrome.storage.local.get(["keywordList", "threshold", "modelBase64"]).then((cfg) => {
  keywordList.value = (cfg.keywordList || []).join("\n");
  if (typeof cfg.threshold === "number") thresholdInput.value = cfg.threshold;
});

saveKeywords.addEventListener("click", async () => {
  const lines = keywordList.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  await chrome.storage.local.set({ keywordList: lines });
  alert("Keywords saved.");
});

saveThreshold.addEventListener("click", async () => {
  const val = parseFloat(thresholdInput.value);
  await chrome.storage.local.set({ threshold: isNaN(val) ? 0.5 : val });
  alert("Threshold saved.");
});

saveModel.addEventListener("click", async () => {
  const file = modelFile.files?.[0];
  if (!file) { alert("No file selected."); return; }
  const buf = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  await chrome.storage.local.set({ modelBase64: base64 });
  alert("Model saved locally.");
});

clearAll.addEventListener("click", async () => {
  await chrome.storage.local.clear();
  alert("Cleared.");
});
