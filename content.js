const DEFAULT_SIZES = [
  { width: 300, height: 300 }
];
const boundImages = new WeakSet();
const processedSignatures = new Set();
const pendingSignatures = new Set();
let settings = {
  enabled: true,
  sizes: DEFAULT_SIZES
};

function normalizeSizes(sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0) {
    return DEFAULT_SIZES;
  }

  const normalized = sizes
    .map((size) => ({
      width: Number.parseInt(size.width, 10),
      height: Number.parseInt(size.height, 10)
    }))
    .filter((size) => size.width > 0 && size.height > 0);

  return normalized.length > 0 ? normalized : DEFAULT_SIZES;
}

function isTargetSize(img) {
  return settings.sizes.some(({ width, height }) => {
    return img.naturalWidth === width && img.naturalHeight === height;
  });
}

function getImageUrl(img) {
  return img.currentSrc || img.src || "";
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

async function inspectImage(img) {
  if (!settings.enabled || !img.isConnected) {
    return;
  }

  const url = getImageUrl(img);
  if (!url || url.startsWith("data:")) {
    return;
  }

  if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
    return;
  }

  const signature = `${url}|${img.naturalWidth}x${img.naturalHeight}`;
  if (processedSignatures.has(signature) || pendingSignatures.has(signature) || !isTargetSize(img)) {
    return;
  }

  pendingSignatures.add(signature);

  try {
    const response = await sendRuntimeMessage({
      action: "downloadImage",
      url,
      width: img.naturalWidth,
      height: img.naturalHeight,
      pageUrl: location.href
    });

    if (response?.ok || response?.reason === "duplicate") {
      processedSignatures.add(signature);
    }
  } catch (_error) {
  } finally {
    pendingSignatures.delete(signature);
  }
}

function ensureImageBinding(img) {
  if (!(img instanceof HTMLImageElement) || boundImages.has(img)) {
    return;
  }

  boundImages.add(img);
  img.addEventListener("load", () => {
    void inspectImage(img);
  });
}

function inspectExistingImages() {
  const images = document.querySelectorAll("img");
  images.forEach((img) => {
    ensureImageBinding(img);
    void inspectImage(img);
  });
  return images.length;
}

function observeImages() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) {
          ensureImageBinding(node);
          void inspectImage(node);
        }

        if (node instanceof Element) {
          node.querySelectorAll("img").forEach((img) => {
            ensureImageBinding(img);
            void inspectImage(img);
          });
        }
      });

      if (
        mutation.type === "attributes" &&
        mutation.target instanceof HTMLImageElement &&
        mutation.attributeName === "src"
      ) {
        void inspectImage(mutation.target);
      }
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"]
  });
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["enabled", "sizes"], (data) => {
      settings = {
        enabled: typeof data.enabled === "boolean" ? data.enabled : true,
        sizes: normalizeSizes(data.sizes)
      };

      resolve(settings);
    });
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  if (changes.enabled) {
    settings.enabled = changes.enabled.newValue !== false;
  }

  if (changes.sizes) {
    settings.sizes = normalizeSizes(changes.sizes.newValue);
  }

  if (settings.enabled) {
    inspectExistingImages();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "rescan") {
    return false;
  }

  sendResponse({ ok: true, inspectedCount: inspectExistingImages() });
  return true;
});

async function init() {
  await loadSettings();
  inspectExistingImages();
  observeImages();
}

void init();
