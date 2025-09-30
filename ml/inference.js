// ml/inference.js (Ausschnitt – tauscht nur die Runtime-Initialisierung)
// Wir laden ONNX Runtime WEB als ES-Module (*.mjs) und Transformers.js (ESM)

let pipe = null;
let threshold = 0.5;

async function importLocal(path) {
  return import(chrome.runtime.getURL(path));
}

async function setupPipeline() {
  if (pipe) return;

  // 1) ONNX Runtime als ES-Module laden
  // Nimm die Datei, die du in vendor/ hast: ort.wasm.min.mjs oder ort.min.mjs
  const ortModule = await importLocal("vendor/ort.wasm.min.mjs");
  // Die ESM-Builds exportieren das Namespace-Objekt in 'default' ODER als Named-Export.
  // Wir normalisieren das:
  const ort = ortModule.default ?? ortModule;

  // WASM-Pfade setzen, damit ORT die .wasm im vendor/-Ordner findet
  ort.env.wasm.wasmPaths = chrome.runtime.getURL("vendor/");

  // 2) Transformers.js laden (ESM)
  const tjs = await importLocal("vendor/transformers.min.js");
  const env = tjs.env ?? tjs.default?.env ?? tjs;
  const pipeline = tjs.pipeline ?? tjs.default?.pipeline;

  // Nur lokale Modelle zulassen und Model-Root setzen
  env.allowRemoteModels = false;
  env.localModelPath = chrome.runtime.getURL("models");
  // Sicherheitshalber auch hier den WASM-Pfad setzen (Transformers greift auf ORT zurück)
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("vendor/");

  // 3) Pipeline einmalig erstellen (Xenova/toxic-bert in models/toxic-bert/)
  pipe = await pipeline("text-classification", "toxic-bert", {
    quantized: true // nutzt model_quantized.onnx, wenn vorhanden
  });

  // 4) Threshold aus Storage lesen (optional)
  const cfg = await chrome.storage.local.get(["threshold"]);
  if (typeof cfg.threshold === "number") threshold = cfg.threshold;
}

export async function initIfNeeded() {
  if (!pipe) await setupPipeline();
}

export async function runDetector(text) {
  await initIfNeeded();
  const results = await pipe(text, { topk: 6, function_to_apply: "sigmoid" });
  const toxic = results.some(r => r.score >= threshold);
  const score = results.reduce((m, r) => Math.max(m, r.score), 0);
  return { toxic, score, labels: results };
}
