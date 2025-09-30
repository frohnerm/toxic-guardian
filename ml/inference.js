let ortReady = false;
let session = null;
let useML = false;
let threshold = 0.5;
let keywords = [];

function uint8ToString(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
}

async function loadONNXRuntime() {
  if (ortReady) return;
  // Load local vendor build
  const scriptUrl = chrome.runtime.getURL("vendor/ort.min.js");
  await import(scriptUrl);
  // Configure WASM path
  // globalThis.ort is provided by the script above
  globalThis.ort.env.wasm.wasmPaths = chrome.runtime.getURL("vendor/");
  ortReady = true;
}

async function loadModelFromStorage() {
  const cfg = await chrome.storage.local.get(["modelBase64", "threshold", "keywordList"]);
  threshold = typeof cfg.threshold === "number" ? cfg.threshold : 0.5;
  keywords = Array.isArray(cfg.keywordList) ? cfg.keywordList : defaultKeywords;

  if (cfg.modelBase64) {
    await loadONNXRuntime();
    const binary = Uint8Array.from(atob(cfg.modelBase64), c => c.charCodeAt(0));
    session = await globalThis.ort.InferenceSession.create(binary, {
      executionProviders: ["wasm"], // local CPU/WASM
    });
    useML = true;
  } else {
    useML = false;
  }
}

// --- SIMPLE KEYWORD FALLBACK (works out of the box) ---
const defaultKeywords = [
  "idiot","stupid","dumb","hate you","kill yourself","retard","racist","sexist","trash","loser"
];

function keywordScan(text) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx >= 0) {
      hits.push({ start: idx, end: idx + kw.length, score: 1.0 });
    }
  }
  return {
    toxic: hits.length > 0,
    spans: hits
  };
}

// --- ML PATH (ADAPT THIS TO YOUR MODEL) ---
import { simpleFeatures } from "./preprocess.js";

async function mlScore(text) {
  // This is a demo using a toy 2-feature model.
  // Replace with your tokenizer & real ONNX inputs.
  const feats = simpleFeatures(text); // Float32Array of shape [2]
  const tensor = new globalThis.ort.Tensor("float32", feats, [1, feats.length]);

  // You MUST adjust input/output names to your model's graph!
  const feeds = { input: tensor };
  const results = await session.run(feeds);
  // Suppose the model outputs a single probability at "prob"
  const score = results.prob?.data?.[0] ?? 0; // Change key to your output name
  return score;
}

export async function initIfNeeded() {
  if (!session && !ortReady) {
    await loadModelFromStorage();
  }
}

// Main API used by content script
export async function runDetector(text) {
  if (!useML) {
    return keywordScan(text);
  }

  try {
    const score = await mlScore(text);
    return {
      toxic: score >= threshold,
      score
      // Optionally, generate spans using a separate span head or heuristic
    };
  } catch (e) {
    console.warn("ML failed, falling back to keywords:", e);
    return keywordScan(text);
  }
}
