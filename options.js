document.addEventListener("DOMContentLoaded", () => {
  const sizesList = document.getElementById("sizes-list");
  const addSizeBtn = document.getElementById("add-size");
  const saveBtn = document.getElementById("save");
  const logList = document.getElementById("log-list");

  // ログを追加する関数
  function addLog(msg) {
    const li = document.createElement("li");
    li.textContent = msg;
    logList.appendChild(li);
  }

  // 保存済みサイズ取得（複数対応）
  chrome.storage.sync.get(["sizes"], (data) => {
    const sizes = data.sizes || [];
    if (sizes.length === 0) {
      addSizeRow(); // 空の入力行1つ追加
    } else {
      sizes.forEach(({ width, height }) => addSizeRow(width, height));
    }
  });

  // サイズ入力行を追加する関数
  function addSizeRow(width = "", height = "") {
    const div = document.createElement("div");
    div.innerHTML = `
      <input type="number" class="width" placeholder="幅" value="${width}" min="1" style="width:60px;"> × 
      <input type="number" class="height" placeholder="高さ" value="${height}" min="1" style="width:60px;">
      <button class="remove">削除</button>
    `;
    sizesList.appendChild(div);

    div.querySelector(".remove").onclick = () => {
      div.remove();
      addLog("サイズ行を削除しました");
    };
  }

  addSizeBtn.onclick = () => {
    addSizeRow();
    addLog("サイズ行を追加しました");
  };

  saveBtn.onclick = () => {
    const rows = sizesList.querySelectorAll("div");
    const sizes = [];

    for (const row of rows) {
      const w = parseInt(row.querySelector(".width").value);
      const h = parseInt(row.querySelector(".height").value);

      if (w > 0 && h > 0) {
        sizes.push({ width: w, height: h });
      }
    }

    if (sizes.length === 0) {
      addLog("⚠️ 幅と高さを1つ以上入力してください");
      return;
    }

    chrome.storage.sync.set({ sizes }, () => {
      addLog(`✅ ${sizes.length}件のサイズを保存しました`);
    });
  };
});
