const DEFAULT_SIZES = [
  { width: 300, height: 300 }
];
const MAX_LOG_ENTRIES = 200;
const LOCAL_STATE_VERSION = 2;
const DEFAULT_SETTINGS = {
  enabled: true,
  sizes: DEFAULT_SIZES
};
const runtimeState = {
  downloadLog: [],
  savedUrls: new Set(),
  pendingDownloadsById: {},
  pendingUrls: new Set(),
  transientPendingUrls: new Set()
};
let initPromise = null;

function storageGet(area, keys) {
  return new Promise((resolve) => {
    chrome.storage[area].get(keys, resolve);
  });
}

function storageSet(area, items) {
  return new Promise((resolve) => {
    chrome.storage[area].set(items, resolve);
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function downloadsDownload(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(downloadId);
    });
  });
}

function downloadsSearch(query) {
  return new Promise((resolve) => {
    chrome.downloads.search(query, resolve);
  });
}

function normalizeSizes(sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0) {
    return DEFAULT_SIZES;
  }

  const unique = new Map();

  sizes.forEach((size) => {
    const width = Number.parseInt(size.width, 10);
    const height = Number.parseInt(size.height, 10);

    if (width > 0 && height > 0) {
      unique.set(`${width}x${height}`, { width, height });
    }
  });

  const normalized = Array.from(unique.values()).sort((a, b) => {
    if (a.width === b.width) {
      return a.height - b.height;
    }

    return a.width - b.width;
  });

  return normalized.length > 0 ? normalized : DEFAULT_SIZES;
}

function normalizeUrl(url) {
  try {
    return new URL(url).href;
  } catch (_error) {
    return url;
  }
}

function normalizeUrlList(urls) {
  if (!Array.isArray(urls)) {
    return [];
  }

  const unique = new Set();

  urls.forEach((url) => {
    const normalizedUrl = normalizeUrl(url);
    if (normalizedUrl && !normalizedUrl.startsWith("data:")) {
      unique.add(normalizedUrl);
    }
  });

  return Array.from(unique);
}

function sanitizeFilename(fileName) {
  return fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFileName(url) {
  try {
    const urlObj = new URL(url);
    const rawName = decodeURIComponent(urlObj.pathname.split("/").pop() || "");
    const baseName = sanitizeFilename(rawName);

    if (baseName) {
      return baseName;
    }
  } catch (_error) {
  }

  return `image-${Date.now()}.jpg`;
}

function normalizeDownloadEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const url = normalizeUrl(entry.url);
  if (!url || url.startsWith("data:")) {
    return null;
  }

  return {
    id: Number.isFinite(entry.id) ? entry.id : null,
    url,
    fileName: typeof entry.fileName === "string" && entry.fileName ? entry.fileName : buildFileName(url),
    width: Number.parseInt(entry.width, 10) || null,
    height: Number.parseInt(entry.height, 10) || null,
    pageUrl: typeof entry.pageUrl === "string" ? entry.pageUrl : "",
    time: typeof entry.time === "string" && entry.time ? entry.time : new Date().toLocaleString("ja-JP")
  };
}

function normalizeDownloadLog(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map(normalizeDownloadEntry)
    .filter((entry) => entry !== null)
    .slice(-MAX_LOG_ENTRIES);
}

function normalizePendingDownloadMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return null;
  }

  const url = normalizeUrl(meta.url);
  if (!url || url.startsWith("data:")) {
    return null;
  }

  return {
    url,
    fileName: typeof meta.fileName === "string" && meta.fileName ? meta.fileName : buildFileName(url),
    width: Number.parseInt(meta.width, 10) || null,
    height: Number.parseInt(meta.height, 10) || null,
    pageUrl: typeof meta.pageUrl === "string" ? meta.pageUrl : "",
    requestedAt: Number.isFinite(meta.requestedAt) ? meta.requestedAt : Date.now()
  };
}

function normalizePendingDownloadsById(items) {
  if (!items || typeof items !== "object") {
    return {};
  }

  return Object.entries(items).reduce((accumulator, [downloadId, meta]) => {
    const normalized = normalizePendingDownloadMeta(meta);

    if (normalized) {
      accumulator[String(downloadId)] = normalized;
    }

    return accumulator;
  }, {});
}

function rebuildPendingUrlSet() {
  runtimeState.pendingUrls = new Set([
    ...runtimeState.transientPendingUrls,
    ...Object.values(runtimeState.pendingDownloadsById).map((meta) => meta.url)
  ]);
}

async function saveLocalState() {
  await storageSet("local", {
    downloadLog: runtimeState.downloadLog.slice(-MAX_LOG_ENTRIES),
    savedUrls: Array.from(runtimeState.savedUrls),
    pendingDownloadsById: runtimeState.pendingDownloadsById,
    stateVersion: LOCAL_STATE_VERSION
  });
}

async function loadRuntimeState() {
  const localData = await storageGet("local", ["downloadLog", "savedUrls", "pendingDownloadsById", "stateVersion"]);

  runtimeState.downloadLog = normalizeDownloadLog(localData.downloadLog);
  runtimeState.savedUrls = new Set(normalizeUrlList(localData.savedUrls));
  runtimeState.pendingDownloadsById = normalizePendingDownloadsById(localData.pendingDownloadsById);
  runtimeState.transientPendingUrls.clear();
  rebuildPendingUrlSet();

  if ((localData.stateVersion || 0) < LOCAL_STATE_VERSION) {
    runtimeState.downloadLog.forEach((entry) => {
      runtimeState.savedUrls.add(entry.url);
    });

    await saveLocalState();
  } else {
    const normalizedSavedCount = normalizeUrlList(localData.savedUrls).length;
    const shouldNormalizeLocalState =
      runtimeState.downloadLog.length !== (Array.isArray(localData.downloadLog) ? localData.downloadLog.length : 0) ||
      runtimeState.savedUrls.size !== normalizedSavedCount;

    if (shouldNormalizeLocalState) {
      await saveLocalState();
    }
  }

  const normalizedPendingCount = Object.keys(runtimeState.pendingDownloadsById).length;
  const storedPendingCount =
    localData.pendingDownloadsById && typeof localData.pendingDownloadsById === "object"
      ? Object.keys(localData.pendingDownloadsById).length
      : 0;

  if (normalizedPendingCount !== storedPendingCount) {
    await saveLocalState();
  }
}

function ensureStateReady() {
  if (!initPromise) {
    initPromise = (async () => {
      await loadRuntimeState();
      await ensureDefaults();
      await reconcilePendingDownloads();
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

async function getSettings() {
  const data = await storageGet("sync", ["enabled", "sizes"]);
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : DEFAULT_SETTINGS.enabled,
    sizes: normalizeSizes(data.sizes)
  };
}

async function ensureDefaults() {
  const current = await storageGet("sync", ["enabled", "sizes"]);
  const updates = {};

  if (typeof current.enabled !== "boolean") {
    updates.enabled = DEFAULT_SETTINGS.enabled;
  }

  if (!Array.isArray(current.sizes) || current.sizes.length === 0) {
    updates.sizes = DEFAULT_SETTINGS.sizes;
  }

  if (Object.keys(updates).length > 0) {
    await storageSet("sync", updates);
  }
}

async function getDownloadLog() {
  await ensureStateReady();
  return runtimeState.downloadLog.slice();
}

async function clearDownloadLog() {
  await ensureStateReady();
  runtimeState.downloadLog = [];
  await saveLocalState();
}

async function updateBadge() {
  const { enabled } = await getSettings();
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#177245" : "#5f6368" });
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await chrome.action.setTitle({
    title: enabled ? "Image Auto Downloader: 有効" : "Image Auto Downloader: 無効"
  });
}

function isDuplicateDownload(url) {
  return runtimeState.savedUrls.has(url);
}

function isPendingDownload(url) {
  return runtimeState.pendingUrls.has(url);
}

async function finalizeDownload(downloadId, meta) {
  runtimeState.savedUrls.add(meta.url);
  runtimeState.downloadLog.push({
    id: downloadId,
    url: meta.url,
    fileName: meta.fileName,
    width: meta.width,
    height: meta.height,
    pageUrl: meta.pageUrl,
    time: new Date().toLocaleString("ja-JP")
  });
  runtimeState.downloadLog = runtimeState.downloadLog.slice(-MAX_LOG_ENTRIES);
  delete runtimeState.pendingDownloadsById[String(downloadId)];
  rebuildPendingUrlSet();
  await saveLocalState();
}

async function discardPendingDownload(downloadId) {
  delete runtimeState.pendingDownloadsById[String(downloadId)];
  rebuildPendingUrlSet();
  await saveLocalState();
}

async function reconcilePendingDownloads() {
  const pendingEntries = Object.entries(runtimeState.pendingDownloadsById);
  let removedUnknownDownload = false;

  for (const [downloadId, meta] of pendingEntries) {
    const [downloadItem] = await downloadsSearch({ id: Number(downloadId) });

    if (!downloadItem) {
      delete runtimeState.pendingDownloadsById[downloadId];
      rebuildPendingUrlSet();
      removedUnknownDownload = true;
      continue;
    }

    if (downloadItem.state === "complete") {
      await finalizeDownload(Number(downloadId), meta);
      continue;
    }

    if (downloadItem.state === "interrupted") {
      await discardPendingDownload(Number(downloadId));
    }
  }

  if (removedUnknownDownload) {
    await saveLocalState();
  }
}

async function handleDownloadImage(message, sender) {
  await ensureStateReady();

  const settings = await getSettings();

  if (!settings.enabled) {
    return { ok: false, reason: "disabled" };
  }

  const url = normalizeUrl(message.url);
  if (!url || url.startsWith("data:")) {
    return { ok: false, reason: "invalid_url" };
  }

  if (isDuplicateDownload(url)) {
    return { ok: false, reason: "duplicate" };
  }

  if (isPendingDownload(url)) {
    return { ok: false, reason: "pending" };
  }

  const fileName = buildFileName(url);
  runtimeState.transientPendingUrls.add(url);
  rebuildPendingUrlSet();

  try {
    const downloadId = await downloadsDownload({
      url,
      filename: fileName,
      saveAs: false,
      conflictAction: "uniquify"
    });

    runtimeState.transientPendingUrls.delete(url);
    runtimeState.pendingDownloadsById[String(downloadId)] = {
      url,
      fileName,
      width: Number.parseInt(message.width, 10) || null,
      height: Number.parseInt(message.height, 10) || null,
      pageUrl: sender.tab?.url || message.pageUrl || "",
      requestedAt: Date.now()
    };
    rebuildPendingUrlSet();
    await saveLocalState();

    return { ok: true, downloadId, fileName };
  } catch (error) {
    runtimeState.transientPendingUrls.delete(url);
    rebuildPendingUrlSet();
    throw error;
  }
}

async function handleGetDownloadLog() {
  return await getDownloadLog();
}

async function handleClearDownloadLog() {
  await clearDownloadLog();
  return { ok: true };
}

async function handleGetStatus() {
  await ensureStateReady();

  const settings = await getSettings();

  return {
    enabled: settings.enabled,
    sizes: settings.sizes,
    downloadCount: runtimeState.downloadLog.length,
    lastDownload: runtimeState.downloadLog[runtimeState.downloadLog.length - 1] || null
  };
}

async function handleRescanActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return { ok: false, reason: "no_active_tab" };
  }

  try {
    const response = await sendMessageToTab(tab.id, { action: "rescan" });
    return {
      ok: true,
      inspectedCount: response?.inspectedCount ?? null
    };
  } catch (error) {
    return {
      ok: false,
      reason: "cannot_rescan",
      error: error.message
    };
  }
}

const actionHandlers = {
  downloadImage: handleDownloadImage,
  getDownloadLog: handleGetDownloadLog,
  clearDownloadLog: handleClearDownloadLog,
  getStatus: handleGetStatus,
  rescanActiveTab: handleRescanActiveTab
};

chrome.runtime.onInstalled.addListener(async () => {
  await ensureStateReady();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureStateReady();
  await updateBadge();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && (changes.enabled || changes.sizes)) {
    void updateBadge();
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state) {
    return;
  }

  const meta = runtimeState.pendingDownloadsById[String(delta.id)];
  if (!meta) {
    return;
  }

  if (delta.state.current === "complete") {
    void finalizeDownload(delta.id, meta);
    return;
  }

  if (delta.state.current === "interrupted") {
    void discardPendingDownload(delta.id);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = actionHandlers[message.action];

  if (!handler) {
    return false;
  }

  Promise.resolve(handler(message, sender))
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error.message
      });
    });

  return true;
});
