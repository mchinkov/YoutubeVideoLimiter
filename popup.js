async function loadSettings() {
  const data = await chrome.storage.local.get(["dailyLimit", "dailyData"]);

  const limit = Number.isInteger(data.dailyLimit) ? data.dailyLimit : 5;
  document.getElementById("limit").value = limit;

  const today = new Date().toISOString().slice(0, 10);
  const count = data.dailyData?.[today]?.count || 0;

  document.getElementById("status").textContent =
    `Today: ${count} / ${limit} videos watched`;
}

document.getElementById("save").addEventListener("click", async () => {
  const input = document.getElementById("limit");
  const value = parseInt(input.value, 10);

  if (!Number.isInteger(value) || value < 1) {
    document.getElementById("status").textContent =
      "Please enter a whole number greater than 0.";
    return;
  }

  await chrome.storage.local.set({ dailyLimit: value });

  const today = new Date().toISOString().slice(0, 10);
  const data = await chrome.storage.local.get(["dailyData"]);
  const count = data.dailyData?.[today]?.count || 0;

  document.getElementById("status").textContent =
    `Saved. Today: ${count} / ${value} videos watched`;
});

loadSettings();