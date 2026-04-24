// Duck Translate - YouTube Subtitles Support

const YOUTUBE_WATCH_URL_PATTERN = "youtube.com/watch";
const YOUTUBE_NAVIGATE_START_EVENT = "yt-navigate-start";
const YOUTUBE_NAVIGATE_FINISH_EVENT = "yt-navigate-finish";
const YOUTUBE_NATIVE_SUBTITLES_CLASS = ".ytp-caption-window-container";
const PLAYER_DATA_REQUEST_TYPE = "DUCK_TRANSLATE_GET_PLAYER_DATA";
const PLAYER_DATA_RESPONSE_TYPE = "DUCK_TRANSLATE_PLAYER_DATA";
const WAIT_TIMEDTEXT_REQUEST_TYPE = "DUCK_TRANSLATE_WAIT_TIMEDTEXT";
const WAIT_TIMEDTEXT_RESPONSE_TYPE = "DUCK_TRANSLATE_TIMEDTEXT";
const ENSURE_SUBTITLES_REQUEST_TYPE = "DUCK_TRANSLATE_ENSURE_SUBTITLES";
const ENSURE_SUBTITLES_RESPONSE_TYPE = "DUCK_TRANSLATE_ENSURE_SUBTITLES_RESPONSE";

const FETCH_RETRY_DELAY_MS = 1000;
const MAX_FETCH_RETRIES = 3;
const MAX_POT_WAIT_ATTEMPTS = 10;
const MAX_STATE_WAIT_ATTEMPTS = 10;
const POST_MESSAGE_TIMEOUT_MS = 5000;
const POT_WAIT_INTERVAL_MS = 500;
const STATE_WAIT_INTERVAL_MS = 300;

class YoutubeSubtitlesFetcher {
  constructor() {
    this.subtitles = [];
    this.sourceLanguage = "";
    this.cachedTrackHash = null;
  }

  async fetch() {
    const videoId = this.getYoutubeVideoId();
    if (!videoId) {
      throw new Error("Video not found");
    }

    const currentHash = await this.computeTrackHash();

    if (currentHash && this.subtitles.length > 0 && this.cachedTrackHash === currentHash) {
      return this.subtitles;
    }

    const fastPathResult = await this.tryFastFetch(videoId);
    let resolvedTrack = fastPathResult.track;
    let events = fastPathResult.events;

    if (!events) {
      const fallbackResult = await this.fetchWithFallback(videoId, fastPathResult.track);
      resolvedTrack = fallbackResult.track;
      events = fallbackResult.events;
    }

    if (!resolvedTrack) {
      throw new Error("No subtitles found");
    }

    this.sourceLanguage = resolvedTrack.languageCode;
    this.subtitles = await this.processRawEvents(events);
    this.cachedTrackHash = this.buildTrackHash(videoId, resolvedTrack);

    return this.subtitles;
  }

  getSourceLanguage() {
    return this.sourceLanguage;
  }

  cleanup() {
    this.subtitles = [];
    this.sourceLanguage = "";
    this.cachedTrackHash = null;
  }

  getYoutubeVideoId() {
    const url = new URL(window.location.href);
    return url.searchParams.get("v") || null;
  }

  async computeTrackHash() {
    const videoId = this.getYoutubeVideoId();
    if (!videoId) {
      return null;
    }

    const response = await this.requestPlayerData(videoId);
    if (!response.success || !response.data) {
      return null;
    }

    const track = this.selectTrack(response.data.captionTracks, response.data.selectedTrackLanguageCode);
    return this.buildTrackHash(videoId, track);
  }

  buildTrackHash(videoId, track) {
    if (!track) {
      return null;
    }
    return `${videoId}:${track.languageCode}:${track.kind || ""}:${track.vssId}`;
  }

  async tryFastFetch(videoId) {
    const response = await this.requestPlayerData(videoId);
    if (!response.success || !response.data) {
      return {
        currentHash: null,
        track: null,
        events: null
      };
    }

    const playerData = response.data;
    const track = this.selectTrack(playerData.captionTracks, playerData.selectedTrackLanguageCode);
    const currentHash = this.buildTrackHash(videoId, track);

    if (!track) {
      return {
        currentHash,
        track: null,
        events: null
      };
    }

    try {
      const events = await this.fetchTrackEvents(track, playerData);
      return {
        currentHash,
        track,
        events
      };
    } catch {
      return {
        currentHash,
        track,
        events: null
      };
    }
  }

  async fetchWithFallback(videoId, preferredTrack) {
    await this.waitForPlayerState(videoId);

    const playerData = await this.getPlayerDataWithPot(videoId);
    const track = this.selectTrack(playerData.captionTracks, playerData.selectedTrackLanguageCode) || preferredTrack;

    if (!track) {
      throw new Error("No subtitles found");
    }

    const events = await this.fetchTrackEvents(track, playerData);
    return { track, events };
  }

  async waitForPlayerState(videoId) {
    for (let i = 0; i < MAX_STATE_WAIT_ATTEMPTS; i++) {
      const response = await this.requestPlayerData(videoId);
      if (response.success && response.data && response.data.playerState >= 1) {
        return;
      }
      await this.sleep(STATE_WAIT_INTERVAL_MS);
    }
  }

  async getPlayerDataWithPot(videoId) {
    const response = await this.requestPlayerData(videoId);

    if (!response.success || !response.data) {
      throw new Error("Failed to get player data");
    }

    let playerData = response.data;

    if (this.hasPotInAudioTracks(playerData) || playerData.cachedTimedtextUrl) {
      return playerData;
    }

    if (playerData.captionTracks.length === 0) {
      return playerData;
    }

    await this.ensureSubtitlesEnabled();

    for (let i = 0; i < MAX_POT_WAIT_ATTEMPTS; i++) {
      await this.sleep(POT_WAIT_INTERVAL_MS);
      const pollResponse = await this.requestPlayerData(videoId);
      if (pollResponse.success && pollResponse.data) {
        playerData = pollResponse.data;
        if (this.hasPotInAudioTracks(playerData) || playerData.cachedTimedtextUrl) {
          return playerData;
        }
      }
    }

    const timedtextUrl = await this.waitForTimedtextUrl(videoId);
    if (timedtextUrl) {
      playerData.cachedTimedtextUrl = timedtextUrl;
    }

    return playerData;
  }

  async fetchTrackEvents(track, playerData) {
    const potToken = this.extractPotToken(track, playerData);
    const url = this.buildSubtitleUrl(track, playerData, potToken);
    return this.fetchWithRetry(url);
  }

  hasPotInAudioTracks(playerData) {
    return playerData.audioCaptionTracks && playerData.audioCaptionTracks.some((t) => {
      try {
        return new URL(t.url).searchParams.has("pot");
      } catch {
        return false;
      }
    });
  }

  async waitForTimedtextUrl(videoId) {
    const resp = await this.postMessageRequest(
      WAIT_TIMEDTEXT_RESPONSE_TYPE,
      { type: WAIT_TIMEDTEXT_REQUEST_TYPE, videoId }
    );
    return resp?.url || null;
  }

  async requestPlayerData(videoId) {
    const resp = await this.postMessageRequest(
      PLAYER_DATA_RESPONSE_TYPE,
      { type: PLAYER_DATA_REQUEST_TYPE, expectedVideoId: videoId }
    );
    if (!resp) {
      return { success: false, error: "TIMEOUT" };
    }
    return { success: resp.success, error: resp.error, data: resp.data };
  }

  async ensureSubtitlesEnabled() {
    await this.postMessageRequest(
      ENSURE_SUBTITLES_RESPONSE_TYPE,
      { type: ENSURE_SUBTITLES_REQUEST_TYPE }
    );
  }

  selectTrack(tracks, selectedLanguageCode) {
    if (!tracks || tracks.length === 0) {
      return null;
    }

    // Priority 1: User's selected track
    if (selectedLanguageCode) {
      const selectedTrack = tracks.find(t => t.languageCode === selectedLanguageCode);
      if (selectedTrack) {
        return selectedTrack;
      }
    }

    // Priority 2: Human subtitles without name
    const humanExact = tracks.find(t => t.kind !== "asr" && !t.name);
    if (humanExact) {
      return humanExact;
    }

    // Priority 3: Human subtitles with name
    const humanWithName = tracks.find(t => t.kind !== "asr");
    if (humanWithName) {
      return humanWithName;
    }

    // Priority 4: Auto-generated speech recognition subtitles
    const asr = tracks.find(t => t.kind === "asr");
    if (asr) {
      return asr;
    }

    return tracks[0];
  }

  async fetchWithRetry(url) {
    let lastError = null;

    for (let i = 0; i < MAX_FETCH_RETRIES; i++) {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          const status = response.status;
          switch (status) {
            case 403:
              throw new Error("Access denied");
            case 404:
              throw new Error("Subtitles not found");
            case 429:
              throw new Error("Too many requests");
            case 500:
              throw new Error("Server error");
            default:
              throw new Error(`HTTP error ${status}`);
          }
        }

        const data = await response.json();
        return data.events || [];
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (i < MAX_FETCH_RETRIES - 1) {
          await this.sleep(FETCH_RETRY_DELAY_MS);
        }
      }
    }

    throw lastError || new Error("Failed to fetch subtitles");
  }

  async processRawEvents(events) {
    const fragments = [];
    let currentText = "";
    let startTime = 0;

    events.forEach(event => {
      if (event.segs) {
        const text = event.segs.map(seg => seg.utf8).join("");
        if (text) {
          if (currentText) {
            fragments.push({
              startTime,
              endTime: event.tStartMs + event.dDurationMs,
              text: currentText
            });
          }
          currentText = text;
          startTime = event.tStartMs;
        }
      } else if (currentText) {
        fragments.push({
          startTime,
          endTime: event.tStartMs,
          text: currentText
        });
        currentText = "";
      }
    });

    if (currentText) {
      fragments.push({
        startTime,
        endTime: startTime + 3000, // Default duration
        text: currentText
      });
    }

    return fragments;
  }

  extractPotToken(track, playerData) {
    if (playerData.cachedTimedtextUrl) {
      const url = new URL(playerData.cachedTimedtextUrl);
      return url.searchParams.get("pot");
    }

    if (playerData.audioCaptionTracks) {
      for (const t of playerData.audioCaptionTracks) {
        try {
          const url = new URL(t.url);
          const pot = url.searchParams.get("pot");
          if (pot) {
            return pot;
          }
        } catch {}
      }
    }

    return null;
  }

  buildSubtitleUrl(track, playerData, potToken) {
    let url = track.baseUrl;
    if (potToken) {
      url = url + "&pot=" + encodeURIComponent(potToken);
    }
    return url;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  postMessageRequest(responseType, message) {
    return new Promise((resolve) => {
      const requestId = this.getRandomUUID();

      const handler = (event) => {
        if (
          event.origin !== window.location.origin ||
          event.data?.type !== responseType ||
          event.data?.requestId !== requestId
        ) {
          return;
        }

        window.removeEventListener("message", handler);
        resolve(event.data);
      };

      window.addEventListener("message", handler);
      window.postMessage({ ...message, requestId }, window.location.origin);

      setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve(null);
      }, POST_MESSAGE_TIMEOUT_MS);
    });
  }

  getRandomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

function initYouTubeSubtitle() {
  if (!window.location.href.includes(YOUTUBE_WATCH_URL_PATTERN)) {
    return;
  }

  const fetcher = new YoutubeSubtitlesFetcher();
  
  function checkSubtitles() {
    const videoElement = document.querySelector('video');
    if (videoElement) {
      const controlsBar = videoElement.closest('.html5-video-player');
      if (controlsBar && !document.getElementById('duck-translate-youtube-button')) {
        createTranslateButton(controlsBar, fetcher);
      }
    }
  }

  function createTranslateButton(controlsBar, fetcher) {
    const button = document.createElement('button');
    button.id = 'duck-translate-youtube-button';
    button.className = 'duck-youtube-translate-btn';
    button.innerHTML = '<span style="font-size: 16px;">🦆</span>';
    button.title = 'Translate subtitles';
    
    button.style.cssText = `
      position: relative;
      background: linear-gradient(135deg, #ffb347 0%, #ffcc5c 100%);
      color: #6b5344;
      border: none;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 8px;
      box-shadow: 0 2px 8px rgba(255, 179, 71, 0.3);
      transition: all 0.2s;
    `;

    button.addEventListener('click', async () => {
      try {
        const subtitles = await fetcher.fetch();
        const sourceLang = fetcher.getSourceLanguage();
        
        if (subtitles.length > 0) {
          showSubtitleTranslation(subtitles, sourceLang);
        } else {
          alert('No subtitles found for this video');
        }
      } catch (error) {
        console.error('Duck Translate: Subtitle error:', error);
        alert('Error fetching subtitles: ' + error.message);
      }
    });

    const rightControls = controlsBar.querySelector('.ytp-right-controls');
    if (rightControls) {
      rightControls.insertBefore(button, rightControls.firstChild);
    }
  }

  function showSubtitleTranslation(subtitles, sourceLang) {
    const container = document.createElement('div');
    container.id = 'duck-translate-subtitle-container';
    container.className = 'duck-subtitle-container';
    container.style.cssText = `
      position: absolute;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      max-width: 80%;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    `;

    const title = document.createElement('h3');
    title.textContent = '🦆 Duck Translate - Subtitles';
    title.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 16px;
      color: #ffb347;
    `;

    const subtitleList = document.createElement('div');
    subtitleList.style.cssText = `
      max-height: 200px;
      overflow-y: auto;
    `;

    subtitles.forEach((subtitle, index) => {
      const subtitleItem = document.createElement('div');
      subtitleItem.className = 'duck-subtitle-item';
      subtitleItem.style.cssText = `
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      `;

      const time = document.createElement('div');
      time.textContent = `${formatTime(subtitle.startTime)} → ${formatTime(subtitle.endTime)}`;
      time.style.cssText = `
        font-size: 12px;
        color: #ffcc5c;
        margin-bottom: 4px;
      `;

      const originalText = document.createElement('div');
      originalText.textContent = subtitle.text;
      originalText.style.cssText = `
        margin-bottom: 4px;
      `;

      const translateButton = document.createElement('button');
      translateButton.textContent = 'Translate';
      translateButton.style.cssText = `
        background: #ffb347;
        color: #6b5344;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
        margin-top: 4px;
      `;

      translateButton.addEventListener('click', async () => {
        try {
          const result = await chrome.runtime.sendMessage({
            action: 'translate',
            text: subtitle.text,
            sourceLang: sourceLang,
            targetLang: 'zh-CN'
          });

          if (result.success) {
            const translation = result.result;
            const translatedText = document.createElement('div');
            translatedText.textContent = translation;
            translatedText.style.cssText = `
              margin-top: 4px;
              color: #ffcc5c;
              font-style: italic;
            `;
            subtitleItem.appendChild(translatedText);
            translateButton.disabled = true;
            translateButton.textContent = 'Translated';
          } else {
            alert('Translation failed: ' + result.error);
          }
        } catch (error) {
          console.error('Duck Translate: Translation error:', error);
          alert('Translation error: ' + error.message);
        }
      });

      subtitleItem.appendChild(time);
      subtitleItem.appendChild(originalText);
      subtitleItem.appendChild(translateButton);
      subtitleList.appendChild(subtitleItem);
    });

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.cssText = `
      background: #ffb347;
      color: #6b5344;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      font-size: 14px;
      cursor: pointer;
      margin-top: 12px;
      width: 100%;
    `;

    closeButton.addEventListener('click', () => {
      container.remove();
    });

    container.appendChild(title);
    container.appendChild(subtitleList);
    container.appendChild(closeButton);

    document.body.appendChild(container);
  }

  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Check initially and on navigation
  checkSubtitles();
  
  document.addEventListener(YOUTUBE_NAVIGATE_FINISH_EVENT, checkSubtitles);
  
  // Also check periodically
  setInterval(checkSubtitles, 3000);
}

// Export for content script
if (typeof window !== 'undefined') {
  window.initYouTubeSubtitle = initYouTubeSubtitle;
}
