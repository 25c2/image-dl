console.log("✅ background.js is running!");

const downloadedFiles = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "downloadImage") {
    try {
      const url = message.url;
      // URLからファイル名抽出（最後の/以降を取得）
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
          // 失敗したらファイル名はリストから除外してリトライ可能に
          downloadedFiles.delete(fileName);
        } else {
          console.log(`✅ ダウンロード成功: ${fileName} (ID: ${downloadId})`);
        }
      });
    } catch (e) {
      console.error("❌ ダウンロード処理で例外:", e);
    }
  }
});
