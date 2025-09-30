// === Auto-Scan + Banner-Reveal Version ===

// Sichtbare Textknoten finden
function* walkTextNodes(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      // schon verarbeitet?
      if (node.parentElement.closest("[data-tg-processed='1']")) return NodeFilter.FILTER_REJECT;

      const style = getComputedStyle(node.parentElement);
      if (!style || style.visibility === "hidden" || style.display === "none") {
        return NodeFilter.FILTER_REJECT;
      }
      // Skript/Style/NoScript ignorieren
      const tag = node.parentElement.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "CANVAS", "SVG"].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n;
  while ((n = walker.nextNode())) yield n;
}

// ML-Interface dynamisch laden
async function getInference() {
  const url = chrome.runtime.getURL("ml/inference.js");
  return import(url);
}

// Banner erstellen (inline), der den Text aufdeckt
function createBanner(onReveal) {
  const banner = document.createElement("span");
  banner.className = "toxic-banner";
  banner.setAttribute("role", "button");
  banner.setAttribute("tabindex", "0");
  banner.textContent = "toxic content – click to reveal";

  const trigger = () => {
    onReveal();
    banner.remove();
  };
  banner.addEventListener("click", trigger);
  banner.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      trigger();
    }
  });
  return banner;
}

// Ganzen Textknoten verdecken
function cloakWholeNode(textNode) {
  const wrapper = document.createElement("span");
  wrapper.className = "toxic-wrapper";
  wrapper.dataset.tgProcessed = "1";

  const hidden = document.createElement("span");
  hidden.className = "toxic-hidden";
  hidden.textContent = textNode.nodeValue;

  const banner = createBanner(() => {
    hidden.classList.add("toxic-revealed");
    // (optional) kleines Badge anzeigen
    const badge = document.createElement("span");
    badge.className = "toxic-badge";
    badge.textContent = "revealed";
    wrapper.appendChild(badge);
  });

  wrapper.appendChild(banner);
  wrapper.appendChild(hidden);

  textNode.parentNode.replaceChild(wrapper, textNode);
}

// Nur toxische Spans im Knoten verdecken
function cloakSpans(textNode, spans) {
  const text = textNode.nodeValue;
  const frag = document.createDocumentFragment();
  let last = 0;

  spans.sort((a, b) => a.start - b.start);

  for (const s of spans) {
    if (s.start > last) {
      frag.appendChild(document.createTextNode(text.slice(last, s.start)));
    }

    // toxischer Teil => Banner + versteckter Teil
    const hidden = document.createElement("span");
    hidden.className = "toxic-hidden";
    hidden.textContent = text.slice(s.start, s.end);

    const banner = createBanner(() => {
      hidden.classList.add("toxic-revealed");
    });

    const wrap = document.createElement("span");
    wrap.className = "toxic-wrapper";
    wrap.dataset.tgProcessed = "1";
    wrap.appendChild(banner);
    wrap.appendChild(hidden);

    frag.appendChild(wrap);
    last = s.end;
  }
  if (last < text.length) {
    frag.appendChild(document.createTextNode(text.slice(last)));
  }
  textNode.parentNode.replaceChild(frag, textNode);
}

// Hauptscan
async function scanPage() {
  try {
    const { runDetector, initIfNeeded } = await getInference();
    await initIfNeeded();

    const nodes = Array.from(walkTextNodes());
    let hits = 0;

    for (const node of nodes) {
      const text = node.nodeValue.trim();
      if (!text) continue;

      const res = await runDetector(text);
      if (res?.toxic) {
        if (res.spans?.length) {
          cloakSpans(node, res.spans);
        } else {
          cloakWholeNode(node);
        }
        hits++;
      }
    }

    chrome.runtime.sendMessage({ type: "SCAN_DONE", count: hits });
  } catch (e) {
    console.error("Scan failed:", e);
    chrome.runtime.sendMessage({ type: "SCAN_ERROR", reason: e?.message || String(e) });
  }
}

// --- Auto-Scan auf Seiten-Ladeende ---
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    scanPage().catch(console.error);
  });
} else {
  // Wenn Script spät injected wird
  scanPage().catch(console.error);
}

// --- Optional: dynamische Inhalte beobachten (infinite scroll, SPA) ---
const mo = new MutationObserver((mutations) => {
  // rudimentär: bei neuem Text nach kurzer Debounce neu scannen
  if (mutations.some(m => m.addedNodes && m.addedNodes.length)) {
    if (window.__tg_scan_timeout) clearTimeout(window.__tg_scan_timeout);
    window.__tg_scan_timeout = setTimeout(() => scanPage().catch(console.error), 500);
  }
});
mo.observe(document.documentElement, { childList: true, subtree: true });

// --- Trigger via Popup/ContextMenu weiterhin möglich ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "RUN_SCAN") {
    scanPage().catch(console.error);
  }
});
