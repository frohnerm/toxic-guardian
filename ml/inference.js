// ml/inference.js — ORT WebGL + Transformers.js (lokal, ohne CDN)

let pipe = null;
let threshold = 0.5;

async function importLocal(p){ return import(chrome.runtime.getURL(p)); }

async function headOk(url) {
  const r = await fetch(url, { method: "HEAD" });
  return r.ok;
}

async function preflightModelFiles() {
  const base = chrome.runtime.getURL("models/toxic-bert/");
  const must = [
    base + "config.json",
    base + "tokenizer.json",
    base + "tokenizer_config.json",
    // special_tokens_map.json ist optional – nur checken, wenn du ihn später hinzufügst
    base + "onnx/model_quantized.onnx"
  ];

  const results = await Promise.all(must.map(async (u) => [u, await headOk(u)]));
  const missing = results.filter(([, ok]) => !ok).map(([u]) => u);
  console.log("[preflight] model files:", Object.fromEntries(
    results.map(([u, ok]) => [u.replace(/^.*\/models\//, "models/"), ok])
  ));
  if (missing.length) {
    throw new Error("Missing local model assets:\n" + missing.join("\n"));
  }
}

export async function initIfNeeded() {
  if (pipe) return;

  // 1) ONNX Runtime (WebGL ESM) lokal laden und GLOBAL machen
  const ortModule = await importLocal("vendor/ort.webgl.min.mjs");
  const ort = ortModule.default ?? ortModule;
  // >>> WICHTIG: global setzen, damit Transformers.js KEIN CDN-Loader zieht
  globalThis.ort = ort;

  // 2) Transformers.js laden (lokal)
  const tjs = await importLocal("vendor/transformers.min.js");
  const env = tjs.env ?? tjs.default?.env ?? tjs;
  const pipeline = tjs.pipeline ?? tjs.default?.pipeline;

  // 3) Nur lokale Modelle, Pfade setzen, Backend WebGL
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = chrome.runtime.getURL("models/");
  env.backends = env.backends || {};
  env.backends.onnx = env.backends.onnx || {};
  env.backends.onnx.backend = "webgl";
  env.useBrowserCache = false;  // optional: keine HTTP-Caches
  env.remoteModelBaseUrl = "";  // optional: harte Bremse (kein Fallback)
 

  // 4) Pipeline bauen – device bleibt "wasm" (Transformers kennt nur webgpu/wasm)
  pipe = await pipeline("text-classification", "toxic-bert", {
    quantized: true,
    dtype: "q8",
    device: "wasm"
  });

// Vor Pipeline-Aufrufen: lokales Modell verifizieren (fails fast)
  await preflightModelFiles();


  const cfg = await chrome.storage.local.get(["threshold"]);
  if (typeof cfg.threshold === "number") threshold = cfg.threshold;
}

export async function runDetector(text) {
  await initIfNeeded();
  const out = await pipe(text, { topk: 6, function_to_apply: "sigmoid" });
  const toxic = out.some(o => o.score >= threshold);
  const score = out.reduce((m, o) => Math.max(m, o.score), 0);
  return { toxic, score, labels: out };
}

export async function runDetectorBatch(texts) {
  await initIfNeeded();
  // transformers pipeline accepts an array of texts and returns an array of results
  const outs = await pipe(texts, { topk: 6, function_to_apply: "sigmoid" });
  // outs: Array<Array<{label, score}>>
  return outs.map(out => {
    const toxic = out.some(o => o.score >= threshold);
    const score = out.reduce((m, o) => Math.max(m, o.score), 0);
    return { toxic, score, labels: out };
  });
}
