chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "downloadImage") {
    const url = message.url;

    chrome.downloads.download({
      url: url,
      filename: "downloaded_image.jpg",
      saveAs: false
    }, (downloadId) => {
      const logEntry = {
        url: url,
        timestamp: new Date().toISOString()
      };

      chrome.storage.local.get({ logs: [] }, (data) => {
        const logs = data.logs;
        logs.push(logEntry);
        chrome.storage.local.set({ logs: logs });
      });
    });
  }
});
