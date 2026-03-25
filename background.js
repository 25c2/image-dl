const DEFAULT_SIZES = [
  { width: 300, height: 300 }
];
const MAX_LOG_ENTRIES = 200;
const DEFAULT_SETTINGS = {
  enabled: true,
  sizes: DEFAULT_SIZES
};
const pendingDownloads = new Set();

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
  const data = await storageGet("local", ["downloadLog"]);
  return Array.isArray(data.downloadLog) ? data.downloadLog : [];
}

async function saveDownloadLog(downloadLog) {
  await storageSet("local", { downloadLog: downloadLog.slice(-MAX_LOG_ENTRIES) });
}

async function clearDownloadLog() {
  await saveDownloadLog([]);
}

async function updateBadge() {
  const { enabled } = await getSettings();
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#177245" : "#5f6368" });
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await chrome.action.setTitle({
    title: enabled ? "Image Auto Downloader: 有効" : "Image Auto Downloader: 無効"
  });
}

async function appendDownloadLog(entry) {
  const downloadLog = await getDownloadLog();
  downloadLog.push(entry);
  await saveDownloadLog(downloadLog);
}

async function isDuplicateDownload(url) {
  const normalizedUrl = normalizeUrl(url);
  const downloadLog = await getDownloadLog();
  return downloadLog.some((entry) => entry.url === normalizedUrl);
}

async function handleDownloadImage(message, sender) {
  const settings = await getSettings();

  if (!settings.enabled) {
    return { ok: false, reason: "disabled" };
  }

  const url = normalizeUrl(message.url);
  if (!url || url.startsWith("data:")) {
    return { ok: false, reason: "invalid_url" };
  }

  if (pendingDownloads.has(url)) {
    return { ok: false, reason: "duplicate" };
  }

  pendingDownloads.add(url);

  try {
    if (await isDuplicateDownload(url)) {
      return { ok: false, reason: "duplicate" };
    }

    const fileName = buildFileName(url);
    const downloadId = await downloadsDownload({
      url,
      filename: fileName,
      saveAs: false,
      conflictAction: "uniquify"
    });

    await appendDownloadLog({
      id: downloadId,
      url,
      fileName,
      width: Number.parseInt(message.width, 10) || null,
      height: Number.parseInt(message.height, 10) || null,
      pageUrl: sender.tab?.url || message.pageUrl || "",
      time: new Date().toLocaleString("ja-JP")
    });

    return { ok: true, downloadId, fileName };
  } finally {
    pendingDownloads.delete(url);
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
  const settings = await getSettings();
  const downloadLog = await getDownloadLog();

  return {
    enabled: settings.enabled,
    sizes: settings.sizes,
    downloadCount: downloadLog.length,
    lastDownload: downloadLog[downloadLog.length - 1] || null
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
  await ensureDefaults();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await updateBadge();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && (changes.enabled || changes.sizes)) {
    void updateBadge();
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
