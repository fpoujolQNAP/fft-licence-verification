// Ouvre popup.html dans un onglet dédié
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("popup.html");
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});

// ══════════════════════════════════════════════
// ── Proxy API ──
// ══════════════════════════════════════════════
// La protection DataDome définit un cookie éphémère lors du chargement de page.
// Ce cookie expire rapidement. Pour les appels API /back/v1/, on doit :
// 1. S'assurer que l'onglet tenup.fft.fr a été rechargé récemment
// 2. Exécuter le fetch dans le contexte MAIN de cet onglet

let _tenupTabId = null;
let _lastRefreshTime = 0;
const SESSION_MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes max avant refresh

async function findTenupTab() {
  if (_tenupTabId) {
    try {
      const tab = await chrome.tabs.get(_tenupTabId);
      if (tab?.url?.startsWith("https://tenup.fft.fr")) return _tenupTabId;
    } catch {}
    _tenupTabId = null;
  }
  const tabs = await chrome.tabs.query({ url: "https://tenup.fft.fr/*" });
  if (tabs.length > 0) {
    _tenupTabId = tabs[0].id;
    return _tenupTabId;
  }
  return null;
}

async function ensureFreshSession(tabId) {
  const now = Date.now();
  if (now - _lastRefreshTime < SESSION_MAX_AGE_MS) {
    return; // session encore fraîche
  }

  console.log("[TenUp bg] Refreshing session (reloading tab)...");
  await chrome.tabs.reload(tabId);

  // Attendre que la page soit complètement chargée
  await new Promise((resolve) => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 15000); // timeout sécurité
  });

  // Attendre un peu que DataDome termine son challenge
  await new Promise((r) => setTimeout(r, 2000));

  _lastRefreshTime = Date.now();
  console.log("[TenUp bg] Session refreshed.");
}

async function fetchViaTab(tabId, url, method, body) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (fetchUrl, fetchMethod, fetchBody) => {
      try {
        const opts = { credentials: "include", method: fetchMethod };
        if (fetchBody !== null && fetchBody !== undefined) {
          opts.headers = { "Content-Type": "application/json" };
          opts.body = JSON.stringify(fetchBody);
        }
        const resp = await fetch(fetchUrl, opts);
        if (!resp.ok) return { status: "error", data: null, text: `Erreur HTTP ${resp.status}` };
        const data = await resp.json();
        return { status: "success", data, text: null };
      } catch (err) {
        return { status: "error", data: null, text: `Erreur : ${err.message}` };
      }
    },
    args: [url, method, body],
  });

  return results?.[0]?.result || { status: "error", data: null, text: "Pas de résultat" };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "refreshSession") {
    // Force un refresh de session au prochain appel
    _lastRefreshTime = 0;
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type !== "fetchApi") return false;

  (async () => {
    try {
      const tabId = await findTenupTab();
      if (!tabId) {
        sendResponse({ status: "error", data: null, text: "Aucun onglet tenup.fft.fr ouvert. Ouvrez tenup.fft.fr et connectez-vous." });
        return;
      }

      // S'assurer que la session est fraîche
      await ensureFreshSession(tabId);

      let result = await fetchViaTab(tabId, msg.url, msg.method, msg.body);
      console.log("[TenUp bg]", result.status, msg.url.split("/").pop(), result.text || "");

      // Si 401 ou erreur réseau, forcer un refresh et réessayer une fois
      if (result.text?.includes("401") || result.text?.includes("Failed to fetch")) {
        console.log("[TenUp bg] Got 401/fetch error, forcing refresh and retrying...");
        _lastRefreshTime = 0;
        await ensureFreshSession(tabId);
        result = await fetchViaTab(tabId, msg.url, msg.method, msg.body);
        console.log("[TenUp bg] Retry:", result.status, msg.url.split("/").pop(), result.text || "");

        // Si encore 401 après retry, marquer pour re-refresh
        if (result.text?.includes("401")) {
          _lastRefreshTime = 0;
        }
      }

      sendResponse(result);
    } catch (err) {
      _tenupTabId = null;
      sendResponse({ status: "error", data: null, text: `Erreur: ${err.message}` });
    }
  })();

  return true;
});
