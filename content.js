console.log("✅ content.js is running!");

function isTargetSize(img, targetWidth, targetHeight) {
  return img.naturalWidth === targetWidth && img.naturalHeight === targetHeight;
}

function checkImages(targetWidth, targetHeight) {
  const images = document.querySelectorAll("img");

  images.forEach(img => {
    const tryDownload = () => {
      if (isTargetSize(img, targetWidth, targetHeight)) {
        console.log(`▶ ダウンロード対象（サイズ一致）: ${img.src} (${img.naturalWidth}x${img.naturalHeight})`);
        chrome.runtime.sendMessage({ action: "downloadImage", url: img.src });
      } else {
        console.log(`▶ サイズ不一致のためスキップ: ${img.src} (${img.naturalWidth}x${img.naturalHeight})`);
      }
    };

    if (img.complete && img.naturalWidth !== 0) {
      tryDownload();
    } else {
      img.onload = tryDownload;
    }
  });
}

function init() {
  chrome.storage.sync.get(["width", "height"], (settings) => {
    const targetWidth = parseInt(settings.width) || 300;
    const targetHeight = parseInt(settings.height) || 300;

    window.addEventListener("load", () => {
      checkImages(targetWidth, targetHeight);
    });
  });
}

init();
