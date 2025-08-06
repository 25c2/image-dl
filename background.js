console.log("✅ background.js is running!");

// 重複チェックセット
const downloadedFiles = new Set();

// ダウンロード履歴を配列で管理（最大100件に制限）
const downloadLog = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "downloadImage") {
    try {
      const url = message.url;
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.substring(pathname.lastIndexOf('/') + 1) || "downloaded_image.jpg";

      if (downloadedFiles.has(fileName)) {
        console.log(`⚠️ 既にダウンロード済みのファイル名です: ${fileName} ためスキップ`);
        return;
      }

      downloadedFiles.add(fileName);

      chrome.downloads.download({
        url: url,
        filename: fileName,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("❌ ダウンロード失敗:", chrome.runtime.lastError.message);
          downloadedFiles.delete(fileName);
        } else {
          console.log(`✅ ダウンロード成功: ${fileName} (ID: ${downloadId})`);

          // ダウンロード成功したら履歴に追加
          downloadLog.push({
            url,
            fileName,
            time: new Date().toLocaleString()
          });
          if (downloadLog.length > 100) downloadLog.shift(); // 最大100件に制限
        }
      });
    } catch (e) {
      console.error("❌ ダウンロード処理で例外:", e);
    }
  } else if (message.action === "getDownloadLog") {
    sendResponse(downloadLog);
  }
});
