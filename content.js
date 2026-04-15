let currentVideoId = null;
let countedForCurrentVideo = false;
let blockOverlay = null;
let watchTimer = null;

function getVideoIdFromUrl() {
  const url = new URL(window.location.href);

  if (url.pathname === "/watch") {
    return url.searchParams.get("v");
  }

  if (url.pathname.startsWith("/shorts/")) {
    return url.pathname.split("/")[2] || null;
  }

  return null;
}

function getVideoElement() {
  return document.querySelector("video");
}

function removeOverlay() {
  if (blockOverlay) {
    blockOverlay.remove();
    blockOverlay = null;
  }
}

function showOverlay(message) {
  if (blockOverlay) return;

  blockOverlay = document.createElement("div");
  blockOverlay.style.position = "fixed";
  blockOverlay.style.inset = "0";
  blockOverlay.style.background = "rgba(0,0,0,0.85)";
  blockOverlay.style.zIndex = "999999";
  blockOverlay.style.display = "flex";
  blockOverlay.style.alignItems = "center";
  blockOverlay.style.justifyContent = "center";
  blockOverlay.style.padding = "24px";

  const box = document.createElement("div");
  box.style.maxWidth = "520px";
  box.style.background = "#111";
  box.style.color = "#fff";
  box.style.padding = "24px";
  box.style.borderRadius = "16px";
  box.style.boxShadow = "0 10px 40px rgba(0,0,0,0.4)";
  box.style.fontFamily = "Arial, sans-serif";
  box.style.textAlign = "center";

  const title = document.createElement("h2");
  title.textContent = "Daily video limit reached";
  title.style.marginTop = "0";

  const text = document.createElement("p");
  text.textContent = message;

  box.appendChild(title);
  box.appendChild(text);
  blockOverlay.appendChild(box);
  document.body.appendChild(blockOverlay);
}

function pauseVideo() {
  const video = getVideoElement();
  if (video) video.pause();
}

async function getStatus() {
  return await chrome.runtime.sendMessage({ type: "GET_STATUS" });
}

async function tryCountVideo(videoId) {
  return await chrome.runtime.sendMessage({
    type: "TRY_COUNT_VIDEO",
    videoId
  });
}

function clearWatchTimer() {
  if (watchTimer) {
    clearTimeout(watchTimer);
    watchTimer = null;
  }
}

async function enforceIfBlockedBeforeCounting(videoId) {
  const status = await getStatus();
  if (!status?.ok) return false;

  const alreadyCountedVideo = false;

  if (status.blocked && !alreadyCountedVideo) {
    pauseVideo();
    showOverlay(
      `You have already watched ${status.count} video(s) today, which is your daily limit. Come back tomorrow.`
    );
    return true;
  }

  removeOverlay();
  return false;
}

async function handleVideoPage() {
  const videoId = getVideoIdFromUrl();

  if (!videoId) {
    currentVideoId = null;
    countedForCurrentVideo = false;
    clearWatchTimer();
    removeOverlay();
    return;
  }

  if (videoId !== currentVideoId) {
    currentVideoId = videoId;
    countedForCurrentVideo = false;
    clearWatchTimer();
    removeOverlay();

    const blocked = await enforceIfBlockedBeforeCounting(videoId);
    if (blocked) return;
  }

  const video = getVideoElement();
  if (!video || countedForCurrentVideo) return;

  const startCountingTimer = () => {
    clearWatchTimer();

    watchTimer = setTimeout(async () => {
      if (countedForCurrentVideo) return;

      const result = await tryCountVideo(videoId);
      if (!result?.ok) return;

      if (result.blocked && !result.counted) {
        pauseVideo();
        showOverlay(
          `You have already watched ${result.count} video(s) today, which is your daily limit.`
        );
        return;
      }

      countedForCurrentVideo = true;

      if (result.blocked) {
        // This video was the last allowed one.
        console.log("Last allowed video for today.");
      }
    }, 10000); // count after 10 seconds of watching
  };

  const cancelCountingTimer = () => {
    clearWatchTimer();
  };

  video.addEventListener("play", startCountingTimer, { once: true });
  video.addEventListener("pause", cancelCountingTimer);
}

let lastUrl = location.href;

const observer = new MutationObserver(async () => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(handleVideoPage, 300);
  }
});

observer.observe(document, { subtree: true, childList: true });

window.addEventListener("load", () => {
  setTimeout(handleVideoPage, 800);
});

setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    handleVideoPage();
  }
}, 1000);