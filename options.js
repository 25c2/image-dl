document.addEventListener("DOMContentLoaded", () => {
  const widthInput = document.getElementById("width");
  const heightInput = document.getElementById("height");
  const saveBtn = document.getElementById("save");
  const logList = document.getElementById("log-list");

  // 設定読み込み
  chrome.storage.sync.get(["width", "height"], (settings) => {
    widthInput.value = settings.width || 300;
    heightInput.value = settings.height || 300;
  });

  // 設定保存
  saveBtn.addEventListener("click", () => {
    const width = widthInput.value;
    const height = heightInput.value;

    chrome.storage.sync.set({ width, height }, () => {
      alert("保存しました！");
    });
  });

  // ログ表示
  chrome.storage.local.get({ logs: [] }, (data) => {
    data.logs.forEach(log => {
      const li = document.createElement("li");
      li.textContent = `[${log.timestamp}] ${log.url}`;
      logList.appendChild(li);
    });
  });
});
