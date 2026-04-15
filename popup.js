function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function render() {
  const data = await chrome.storage.local.get([
    "dailyLimit",
    "dailyData",
    "debugEnabled"
  ]);

  const limit = Number.isInteger(data.dailyLimit) ? data.dailyLimit : 5;
  const today = getTodayKey();
  const count = data.dailyData?.[today]?.count || 0;
  const debugEnabled = data.debugEnabled === true;

  document.getElementById("limit").value = limit;
  document.getElementById("debug").checked = debugEnabled;
  document.getElementById("status").textContent =
    `Today: ${count} / ${limit} videos watched. Debug logging is ${
      debugEnabled ? "on" : "off"
    }.`;
}

document.getElementById("save").addEventListener("click", async () => {
  const input = document.getElementById("limit");
  const debugInput = document.getElementById("debug");
  const value = parseInt(input.value, 10);

  if (!Number.isInteger(value) || value < 1) {
    document.getElementById("status").textContent =
      "Please enter a whole number greater than 0.";
    return;
  }

  await chrome.storage.local.set({
    dailyLimit: value,
    debugEnabled: debugInput.checked
  });
  await render();
});

chrome.storage.onChanged.addListener(() => {
  render();
});

render();
