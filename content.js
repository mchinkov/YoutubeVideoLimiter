let currentVideoId = null;
let countedForCurrentVideo = false;
let overlayEl = null;

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
  }
}

function showOverlay(message) {
  if (overlayEl) return;

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

  const text = document.createElement("p");
  text.textContent = message;

  box.appendChild(title);
  box.appendChild(text);
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

async function syncVideoState() {
  const videoId = getVideoIdFromUrl();
  const video = getVideoElement();

  if (!videoId || !video) {
    currentVideoId = null;
    countedForCurrentVideo = false;
    removeOverlay();
    return;
  }

  if (videoId !== currentVideoId) {
    currentVideoId = videoId;
    countedForCurrentVideo = false;
    removeOverlay();

    const status = await sendMessage({ type: "GET_STATUS" });
    if (!status?.ok) return;

    if (status.blocked) {
      const alreadyViewedCheck = await sendMessage({
        type: "CHECK_VIDEO_ALREADY_VIEWED",
        videoId
      });

      if (alreadyViewedCheck?.ok && !alreadyViewedCheck.alreadyViewed) {
        pauseVideo();
        showOverlay(
          `You have already watched ${status.count} video(s) today, which is your limit.`
        );
        return;
      }
    }
  }

  if (countedForCurrentVideo) return;

  if (!video.paused && video.currentTime >= 10) {
    const result = await sendMessage({
      type: "TRY_COUNT_VIDEO",
      videoId
    });

    if (!result?.ok) return;

    if (result.blocked && !result.counted && !result.alreadyViewed) {
      pauseVideo();
      showOverlay(
        `You have already watched ${result.count} video(s) today, which is your limit.`
      );
      return;
    }

    countedForCurrentVideo = true;
    removeOverlay();
    console.log("Video counted:", videoId, result);
  }
}

setInterval(syncVideoState, 1000);
window.addEventListener("yt-navigate-finish", syncVideoState);
window.addEventListener("load", () => {
  setTimeout(syncVideoState, 1000);
});