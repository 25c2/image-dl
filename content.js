function isTargetSize(img, targetWidth, targetHeight) {
  return img.naturalWidth === targetWidth && img.naturalHeight === targetHeight;
}

function checkImages(targetWidth, targetHeight) {
  const images = document.querySelectorAll("img");

  images.forEach(img => {
    if (img.complete && isTargetSize(img, targetWidth, targetHeight)) {
      chrome.runtime.sendMessage({
        action: "downloadImage",
        url: img.src
      });
    }
  });
}

function init() {
  chrome.storage.sync.get(["width", "height"], (settings) => {
    const targetWidth = parseInt(settings.width) || 300;
    const targetHeight = parseInt(settings.height) || 300;

    window.addEventListener("load", () => checkImages(targetWidth, targetHeight));
  });
}

init();
