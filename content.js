console.log("✅ content.js is running!");

function isTargetSize(img, sizes) {
  return sizes.some(({width, height}) => img.naturalWidth === width && img.naturalHeight === height);
}

function checkImages(sizes) {
  const images = document.querySelectorAll("img");

  images.forEach(img => {
    const tryDownload = () => {
      if (isTargetSize(img, sizes)) {
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
  chrome.storage.sync.get(["sizes"], (data) => {
    const sizes = data.sizes && data.sizes.length ? data.sizes : [{width:300, height:300}];

    window.addEventListener("load", () => {
      checkImages(sizes);
    });
  });
}

init();
