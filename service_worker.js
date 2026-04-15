const DEFAULT_LIMIT = 5;

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function getState() {
  const today = getTodayKey();
  const data = await chrome.storage.local.get([
    "dailyLimit",
    "dailyData"
  ]);

  const dailyLimit = Number.isInteger(data.dailyLimit) && data.dailyLimit > 0
    ? data.dailyLimit
    : DEFAULT_LIMIT;

  const dailyData = data.dailyData || {};
  const todayData = dailyData[today] || { count: 0, viewedVideoIds: [] };

  return {
    today,
    dailyLimit,
    dailyData,
    todayData
  };
}

async function saveTodayData(today, todayData, existingDailyData) {
  const newDailyData = {
    ...existingDailyData,
    [today]: todayData
  };

  await chrome.storage.local.set({ dailyData: newDailyData });
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["dailyLimit"]);
  if (!existing.dailyLimit) {
    await chrome.storage.local.set({ dailyLimit: DEFAULT_LIMIT });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_STATUS") {
      const { dailyLimit, todayData } = await getState();

      sendResponse({
        ok: true,
        limit: dailyLimit,
        count: todayData.count,
        remaining: Math.max(0, dailyLimit - todayData.count),
        blocked: todayData.count >= dailyLimit
      });
      return;
    }

    if (message?.type === "TRY_COUNT_VIDEO") {
      const videoId = message.videoId;
      if (!videoId) {
        sendResponse({ ok: false, error: "Missing videoId" });
        return;
      }

      const { today, dailyLimit, dailyData, todayData } = await getState();

      const alreadyViewed = todayData.viewedVideoIds.includes(videoId);
      if (alreadyViewed) {
        sendResponse({
          ok: true,
          counted: false,
          alreadyViewed: true,
          count: todayData.count,
          limit: dailyLimit,
          blocked: todayData.count >= dailyLimit
        });
        return;
      }

      if (todayData.count >= dailyLimit) {
        sendResponse({
          ok: true,
          counted: false,
          alreadyViewed: false,
          count: todayData.count,
          limit: dailyLimit,
          blocked: true
        });
        return;
      }

      const updatedTodayData = {
        count: todayData.count + 1,
        viewedVideoIds: [...todayData.viewedVideoIds, videoId]
      };

      await saveTodayData(today, updatedTodayData, dailyData);

      sendResponse({
        ok: true,
        counted: true,
        alreadyViewed: false,
        count: updatedTodayData.count,
        limit: dailyLimit,
        blocked: updatedTodayData.count >= dailyLimit
      });
    }
  })();

  return true;
});