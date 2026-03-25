const DEFAULT_SIZES = [
  { width: 300, height: 300 }
];
const PRESET_SIZES = [
  { width: 300, height: 300 },
  { width: 512, height: 512 },
  { width: 768, height: 768 },
  { width: 1024, height: 1024 }
];

document.addEventListener("DOMContentLoaded", async () => {
  const sizesList = document.getElementById("sizes-list");
  const addSizeBtn = document.getElementById("add-size");
  const restoreDefaultsBtn = document.getElementById("restore-defaults");
  const saveBtn = document.getElementById("save");
  const clearHistoryBtn = document.getElementById("clear-history");
  const enabledToggle = document.getElementById("enabled-toggle");
  const logList = document.getElementById("log-list");
  const downloadLogList = document.getElementById("download-log-list");
  const presetButtons = document.getElementById("preset-buttons");
  const sizeRowTemplate = document.getElementById("size-row-template");
  const saveFeedback = document.getElementById("save-feedback");
  const statusBadge = document.getElementById("status-badge");
  const statusSummary = document.getElementById("status-summary");
  const historySummary = document.getElementById("history-summary");

  function addLog(message, type = "info") {
    const li = document.createElement("li");
    li.className = `log-item ${type}`;
    li.textContent = `[${new Date().toLocaleTimeString("ja-JP")}] ${message}`;
    logList.prepend(li);

    while (logList.children.length > 12) {
      logList.removeChild(logList.lastChild);
    }
  }

  function normalizeSizes(sizes) {
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

  function setSaveFeedback(message, tone = "muted") {
    saveFeedback.textContent = message;
    saveFeedback.className = `feedback ${tone}`;
  }

  function createSizeRow(width = "", height = "") {
    const fragment = sizeRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".size-row");
    row.querySelector(".width").value = width;
    row.querySelector(".height").value = height;
    row.querySelector(".remove").addEventListener("click", () => {
      row.remove();
      addLog("サイズ行を削除したわ。", "warning");
      setSaveFeedback("削除しただけじゃ保存されないから。ちゃんと押しなさい。", "warning");
    });
    return row;
  }

  function renderSizes(sizes) {
    sizesList.innerHTML = "";
    normalizeSizes(sizes).forEach(({ width, height }) => {
      sizesList.appendChild(createSizeRow(width, height));
    });
  }

  function collectSizes() {
    const rows = sizesList.querySelectorAll(".size-row");
    return normalizeSizes(Array.from(rows, (row) => ({
      width: row.querySelector(".width").value,
      height: row.querySelector(".height").value
    })));
  }

  function addPresetButtons() {
    presetButtons.innerHTML = "";
    PRESET_SIZES.forEach(({ width, height }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip-button";
      button.textContent = `${width}×${height}`;
      button.addEventListener("click", () => {
        const sizes = collectSizes();
        renderSizes([...sizes, { width, height }]);
        addLog(`${width}×${height} を追加したわ。`, "info");
        setSaveFeedback("追加はした。保存はまだ。", "warning");
      });
      presetButtons.appendChild(button);
    });
  }

  function renderStatus(status) {
    statusBadge.textContent = status.enabled ? "有効" : "無効";
    statusBadge.className = `badge ${status.enabled ? "success" : "muted"}`;
    statusSummary.textContent = status.enabled
      ? `${status.sizes.length}件のサイズを監視中`
      : "自動ダウンロードは停止中";
    enabledToggle.checked = status.enabled;
  }

  function renderHistorySummary(status) {
    const cards = [
      {
        label: "監視サイズ数",
        value: `${status.sizes.length}件`
      },
      {
        label: "履歴件数",
        value: `${status.downloadCount}件`
      },
      {
        label: "最終ダウンロード",
        value: status.lastDownload ? status.lastDownload.time : "まだなし"
      }
    ];

    historySummary.innerHTML = "";
    cards.forEach((card) => {
      const article = document.createElement("article");
      article.className = "summary-card";
      article.innerHTML = `
        <span>${card.label}</span>
        <strong>${card.value}</strong>
      `;
      historySummary.appendChild(article);
    });
  }

  async function refreshStatus() {
    const status = await chrome.runtime.sendMessage({ action: "getStatus" });
    renderStatus(status);
    renderHistorySummary(status);
  }

  async function refreshDownloadLog() {
    const log = await chrome.runtime.sendMessage({ action: "getDownloadLog" });
    downloadLogList.innerHTML = "";

    if (!log || log.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = "まだ履歴は空。働けてないわけじゃなくて、対象画像がなかっただけかもね。";
      downloadLogList.appendChild(li);
      return;
    }

    [...log].reverse().forEach(({ url, fileName, time, width, height, pageUrl }) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const primary = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = fileName;
      const timeText = document.createElement("p");
      timeText.textContent = time;
      const sizeText = document.createElement("p");
      sizeText.textContent = width && height ? `${width}×${height}` : "サイズ情報なし";
      primary.append(title, timeText, sizeText);

      const meta = document.createElement("div");
      meta.className = "history-meta";
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = url;
      const source = document.createElement("span");
      source.textContent = pageUrl || "取得元ページなし";
      meta.append(link, source);

      li.append(primary, meta);
      downloadLogList.appendChild(li);
    });
  }

  async function loadSettings() {
    const data = await chrome.storage.sync.get(["enabled", "sizes"]);
    const enabled = typeof data.enabled === "boolean" ? data.enabled : true;
    const sizes = normalizeSizes(data.sizes || DEFAULT_SIZES);
    enabledToggle.checked = enabled;
    renderSizes(sizes);
  }

  addSizeBtn.addEventListener("click", () => {
    sizesList.appendChild(createSizeRow());
    addLog("空のサイズ行を追加。好きに埋めなさい。", "info");
    setSaveFeedback("入力したら保存。そこまで言わせんな。", "warning");
  });

  restoreDefaultsBtn.addEventListener("click", () => {
    renderSizes(DEFAULT_SIZES);
    enabledToggle.checked = true;
    addLog("初期値に戻したわ。", "warning");
    setSaveFeedback("初期値を反映するなら保存が必要。", "warning");
  });

  saveBtn.addEventListener("click", async () => {
    const sizes = collectSizes();
    await chrome.storage.sync.set({
      enabled: enabledToggle.checked,
      sizes
    });
    await refreshStatus();
    setSaveFeedback(`${sizes.length}件のサイズを保存したわ。感謝しなさい。`, "success");
    addLog(`${sizes.length}件のサイズを保存。状態は ${enabledToggle.checked ? "有効" : "無効"}。`, "success");
  });

  clearHistoryBtn.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "clearDownloadLog" });
    await refreshDownloadLog();
    await refreshStatus();
    addLog("ダウンロード履歴を消したわ。", "warning");
  });

  enabledToggle.addEventListener("change", () => {
    setSaveFeedback(
      enabledToggle.checked
        ? "有効化の変更はまだ未保存。詰めが甘いわね。"
        : "無効化の変更はまだ未保存。押し忘れないで。",
      "warning"
    );
  });

  addPresetButtons();
  await loadSettings();
  await refreshStatus();
  await refreshDownloadLog();
  addLog("設定画面の準備はできたわ。", "success");
});
