const DEFAULT_LIMIT = 5;
const DEBUG_KEY = "debugEnabled";
let countQueue = Promise.resolve();

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function getState() {
  const today = getTodayKey();
  const data = await chrome.storage.local.get(["dailyLimit", "dailyData"]);

  const dailyLimit =
    Number.isInteger(data.dailyLimit) && data.dailyLimit > 0
      ? data.dailyLimit
      : DEFAULT_LIMIT;

  const dailyData = data.dailyData || {};
  const todayData = dailyData[today] || { count: 0, viewedVideoIds: [] };

  return { today, dailyLimit, dailyData, todayData };
}

async function saveTodayData(today, todayData, dailyData) {
  await chrome.storage.local.set({
    dailyData: {
      ...dailyData,
      [today]: todayData
    }
  });
}

async function isDebugEnabled() {
  const data = await chrome.storage.local.get([DEBUG_KEY]);
  return data.debugEnabled === true;
}

async function debugLog(...args) {
  if (await isDebugEnabled()) {
    console.log("[Daily Video Limit][worker]", ...args);
  }
}

function queueCountOperation(task) {
  const queuedTask = countQueue.then(task, task);
  countQueue = queuedTask.catch(() => {});
  return queuedTask;
}

async function handleMessage(message) {
  const { today, dailyLimit, dailyData, todayData } = await getState();

  if (message?.type === "GET_STATUS") {
    await debugLog("GET_STATUS", {
      count: todayData.count,
      limit: dailyLimit,
      blocked: todayData.count >= dailyLimit
    });
    return {
      ok: true,
      limit: dailyLimit,
      count: todayData.count,
      remaining: Math.max(0, dailyLimit - todayData.count),
      blocked: todayData.count >= dailyLimit
    };
  }

  if (message?.type === "CHECK_VIDEO_ALREADY_VIEWED") {
    const videoId = message.videoId;
    const alreadyViewed = todayData.viewedVideoIds.includes(videoId);
    await debugLog("CHECK_VIDEO_ALREADY_VIEWED", { videoId, alreadyViewed });
    return {
      ok: true,
      alreadyViewed
    };
  }

  if (message?.type === "TRY_COUNT_VIDEO") {
    const videoId = message.videoId;

    if (!videoId) {
      return { ok: false, error: "Missing videoId" };
    }

    const alreadyViewed = todayData.viewedVideoIds.includes(videoId);

    if (alreadyViewed) {
      await debugLog("TRY_COUNT_VIDEO_SKIPPED_ALREADY_VIEWED", {
        videoId,
        count: todayData.count,
        limit: dailyLimit
      });
      return {
        ok: true,
        counted: false,
        alreadyViewed: true,
        count: todayData.count,
        limit: dailyLimit,
        blocked: todayData.count >= dailyLimit
      };
    }

    if (todayData.count >= dailyLimit) {
      await debugLog("TRY_COUNT_VIDEO_BLOCKED", {
        videoId,
        count: todayData.count,
        limit: dailyLimit
      });
      return {
        ok: true,
        counted: false,
        alreadyViewed: false,
        count: todayData.count,
        limit: dailyLimit,
        blocked: true
      };
    }

    const updatedTodayData = {
      count: todayData.count + 1,
      viewedVideoIds: [...todayData.viewedVideoIds, videoId]
    };

    await saveTodayData(today, updatedTodayData, dailyData);
    await debugLog("TRY_COUNT_VIDEO_COUNTED", {
      videoId,
      count: updatedTodayData.count,
      limit: dailyLimit
    });

    return {
      ok: true,
      counted: true,
      alreadyViewed: false,
      count: updatedTodayData.count,
      limit: dailyLimit,
      blocked: updatedTodayData.count >= dailyLimit
    };
  }

  if (message?.type === "RESET_DEBUG_STATE") {
    await chrome.storage.local.set({
      dailyLimit: DEFAULT_LIMIT,
      dailyData: {},
      debugEnabled: true
    });
    await debugLog("RESET_DEBUG_STATE");
    return {
      ok: true,
      limit: DEFAULT_LIMIT,
      count: 0,
      blocked: false
    };
  }

  return { ok: false, error: "Unknown message type" };
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["dailyLimit", DEBUG_KEY]);
  const updates = {};

  if (!existing.dailyLimit) {
    updates.dailyLimit = DEFAULT_LIMIT;
  }

  if (typeof existing.debugEnabled !== "boolean") {
    updates.debugEnabled = false;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const runHandler =
    message?.type === "TRY_COUNT_VIDEO"
      ? queueCountOperation(() => handleMessage(message))
      : handleMessage(message);

  runHandler
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      console.error("Message handling failed:", error);
      sendResponse({ ok: false, error: "Internal error" });
    });

  return true;
});
