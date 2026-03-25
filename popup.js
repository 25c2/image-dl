document.addEventListener("DOMContentLoaded", async () => {
  const DEFAULT_SIZES = [
    { width: 300, height: 300 }
  ];
  const badge = document.getElementById("popup-badge");
  const enabledToggle = document.getElementById("popup-enabled");
  const summary = document.getElementById("popup-summary");
  const sizes = document.getElementById("popup-sizes");
  const rescanButton = document.getElementById("popup-rescan");
  const optionsButton = document.getElementById("popup-options");
  const message = document.getElementById("popup-message");

  function setMessage(text, tone = "muted") {
    message.textContent = text;
    message.className = `feedback ${tone}`;
  }

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

  function renderStatus(status) {
    badge.textContent = status.enabled ? "有効" : "無効";
    badge.className = `badge ${status.enabled ? "success" : "muted"}`;
    enabledToggle.checked = status.enabled;
    summary.textContent = `監視サイズ ${status.sizes.length}件 / 履歴 ${status.downloadCount}件`;

    sizes.innerHTML = "";
    status.sizes.forEach((size) => {
      const span = document.createElement("span");
      span.className = "size-chip";
      span.textContent = `${size.width}×${size.height}`;
      sizes.appendChild(span);
    });
  }

  async function refresh() {
    const status = await chrome.runtime.sendMessage({ action: "getStatus" });
    renderStatus(status);
  }

  enabledToggle.addEventListener("change", async () => {
    const current = await chrome.storage.sync.get(["sizes"]);
    await chrome.storage.sync.set({
      enabled: enabledToggle.checked,
      sizes: normalizeSizes(current.sizes)
    });
    await refresh();
    setMessage(
      enabledToggle.checked ? "有効にしたわ。これで働くでしょ。" : "無効にした。今は静かよ。",
      enabledToggle.checked ? "success" : "warning"
    );
  });

  rescanButton.addEventListener("click", async () => {
    const result = await chrome.runtime.sendMessage({ action: "rescanActiveTab" });
    if (result.ok) {
      setMessage(
        result.inspectedCount !== null
          ? `${result.inspectedCount}枚を再確認したわ。`
          : "再確認を投げたわ。",
        "success"
      );
      return;
    }

    setMessage("このページは再確認できなかった。権限外か特殊ページね。", "warning");
  });

  optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  await refresh();
});
