let currentVideoId = null;
let countedForCurrentVideo = false;
let blockedForCurrentVideo = false;
let debugEnabled = false;
let overlayEl = null;
let overlayTextEl = null;
let currentDayKey = getTodayKey();

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getVideoIdFromUrl() {
  try {
    const url = new URL(window.location.href);

    if (url.pathname === "/watch") {
      return url.searchParams.get("v");
    }

    if (url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/")[2] || null;
    }

    return null;
  } catch {
    return null;
  }
}

function getVideoElement() {
  return document.querySelector("video");
}

function removeOverlay() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    overlayTextEl = null;
  }
}

function showOverlay(message) {
  if (overlayEl) {
    if (overlayTextEl) overlayTextEl.textContent = message;
    return;
  }

  overlayEl = document.createElement("div");
  overlayEl.style.position = "fixed";
  overlayEl.style.inset = "0";
  overlayEl.style.background = "rgba(0,0,0,0.85)";
  overlayEl.style.zIndex = "999999";
  overlayEl.style.display = "flex";
  overlayEl.style.alignItems = "center";
  overlayEl.style.justifyContent = "center";
  overlayEl.style.padding = "24px";

  const box = document.createElement("div");
  box.style.maxWidth = "520px";
  box.style.background = "#111";
  box.style.color = "#fff";
  box.style.padding = "24px";
  box.style.borderRadius = "16px";
  box.style.fontFamily = "Arial, sans-serif";
  box.style.textAlign = "center";

  const title = document.createElement("h2");
  title.textContent = "Daily video limit reached";
  title.style.marginTop = "0";

  overlayTextEl = document.createElement("p");
  overlayTextEl.textContent = message;

  box.appendChild(title);
  box.appendChild(overlayTextEl);
  overlayEl.appendChild(box);
  document.body.appendChild(overlayEl);
}

function pauseVideo() {
  const video = getVideoElement();
  if (video) video.pause();
}

async function sendMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    console.error("sendMessage failed:", err);
    return null;
  }
}

async function loadDebugEnabled() {
  const data = await chrome.storage.local.get(["debugEnabled"]);
  debugEnabled = data.debugEnabled === true;
}

function debugLog(...args) {
  if (debugEnabled) {
    console.log("[Daily Video Limit][content]", ...args);
  }
}

function resetCurrentVideoState() {
  countedForCurrentVideo = false;
  blockedForCurrentVideo = false;
  removeOverlay();
}

async function refreshBlockState(videoId) {
  const status = await sendMessage({ type: "GET_STATUS" });
  if (!status?.ok) return false;

  if (!status.blocked) {
    blockedForCurrentVideo = false;
    removeOverlay();
    return false;
  }

  const alreadyViewedCheck = await sendMessage({
    type: "CHECK_VIDEO_ALREADY_VIEWED",
    videoId
  });

  if (!alreadyViewedCheck?.ok) return false;

  blockedForCurrentVideo = !alreadyViewedCheck.alreadyViewed;

  if (blockedForCurrentVideo) {
    debugLog("VIDEO_BLOCKED", {
      videoId,
      count: status.count,
      limit: status.limit
    });
    pauseVideo();
    showOverlay(
      `You have already watched ${status.count} video(s) today, which is your limit.`
    );
    return true;
  }

  removeOverlay();
  return false;
}

async function syncVideoState() {
  const todayKey = getTodayKey();
  if (todayKey !== currentDayKey) {
    debugLog("DAY_ROLLOVER", { from: currentDayKey, to: todayKey });
    currentDayKey = todayKey;
    currentVideoId = null;
    resetCurrentVideoState();
  }

  const videoId = getVideoIdFromUrl();
  const video = getVideoElement();

  if (!videoId || !video) {
    currentVideoId = null;
    resetCurrentVideoState();
    return;
  }

  if (videoId !== currentVideoId) {
    debugLog("VIDEO_CHANGED", { from: currentVideoId, to: videoId });
    currentVideoId = videoId;
    resetCurrentVideoState();
  }

  if (!countedForCurrentVideo) {
    const blocked = await refreshBlockState(videoId);
    if (blocked) return;
  }

  if (countedForCurrentVideo) return;

  if (!video.paused && video.currentTime >= 10) {
    const result = await sendMessage({
      type: "TRY_COUNT_VIDEO",
      videoId
    });

    if (!result?.ok) return;

    if (result.blocked && !result.counted && !result.alreadyViewed) {
      blockedForCurrentVideo = true;
      debugLog("VIDEO_BLOCKED_DURING_COUNT", {
        videoId,
        count: result.count,
        limit: result.limit
      });
      pauseVideo();
      showOverlay(
        `You have already watched ${result.count} video(s) today, which is your limit.`
      );
      return;
    }

    countedForCurrentVideo = true;
    blockedForCurrentVideo = false;
    removeOverlay();
    debugLog("VIDEO_COUNTED", { videoId, result });
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !Object.hasOwn(changes, "debugEnabled")) return;

  debugEnabled = changes.debugEnabled.newValue === true;
  debugLog("DEBUG_LOGGING_UPDATED", { enabled: debugEnabled });
});

loadDebugEnabled().catch((error) => {
  console.error("Failed to load debug setting:", error);
});

setInterval(syncVideoState, 1000);
window.addEventListener("yt-navigate-finish", syncVideoState);
window.addEventListener("load", () => {
  setTimeout(syncVideoState, 1000);
});
