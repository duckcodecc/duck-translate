// Duck Translate - YouTube Player Data Injector

const PLAYER_DATA_REQUEST_TYPE = "DUCK_TRANSLATE_GET_PLAYER_DATA";
const PLAYER_DATA_RESPONSE_TYPE = "DUCK_TRANSLATE_PLAYER_DATA";
const WAIT_TIMEDTEXT_REQUEST_TYPE = "DUCK_TRANSLATE_WAIT_TIMEDTEXT";
const WAIT_TIMEDTEXT_RESPONSE_TYPE = "DUCK_TRANSLATE_TIMEDTEXT";
const ENSURE_SUBTITLES_REQUEST_TYPE = "DUCK_TRANSLATE_ENSURE_SUBTITLES";
const ENSURE_SUBTITLES_RESPONSE_TYPE = "DUCK_TRANSLATE_ENSURE_SUBTITLES_RESPONSE";

function getYouTubePlayer() {
  // Try different ways to get the YouTube player
  const players = document.getElementsByTagName('ytd-player');
  if (players.length > 0) {
    return players[0].getPlayer();
  }
  
  // Try another approach
  if (window.ytplayer) {
    return window.ytplayer;
  }
  
  // Try getting from iframe
  const iframes = document.getElementsByTagName('iframe');
  for (const iframe of iframes) {
    try {
      if (iframe.contentWindow && iframe.contentWindow.ytplayer) {
        return iframe.contentWindow.ytplayer;
      }
    } catch (e) {
      // Cross-origin error, skip
    }
  }
  
  return null;
}

function getPlayerData() {
  const player = getYouTubePlayer();
  if (!player) {
    return null;
  }
  
  try {
    // Get player state
    const playerState = player.getPlayerState();
    
    // Get caption tracks
    const captionTracks = player.getOption('captions', 'tracklist') || [];
    
    // Get selected track language code
    const selectedTrack = player.getOption('captions', 'track');
    const selectedTrackLanguageCode = selectedTrack ? selectedTrack.languageCode : null;
    
    // Get audio caption tracks (for POT token)
    const audioCaptionTracks = [];
    
    // Get cached timedtext URL if available
    const cachedTimedtextUrl = null; // Not available in all player versions
    
    return {
      playerState,
      captionTracks: captionTracks.map(track => ({
        baseUrl: track.baseUrl,
        languageCode: track.languageCode,
        kind: track.kind,
        name: track.name,
        vssId: track.vssId
      })),
      selectedTrackLanguageCode,
      audioCaptionTracks,
      cachedTimedtextUrl
    };
  } catch (e) {
    console.error('Duck Translate: Error getting player data', e);
    return null;
  }
}

function ensureSubtitlesEnabled() {
  const player = getYouTubePlayer();
  if (player) {
    try {
      // Enable captions if not already enabled
      const captionsEnabled = player.getOption('captions', 'track');
      if (!captionsEnabled) {
        // Try to enable captions
        const tracks = player.getOption('captions', 'tracklist');
        if (tracks && tracks.length > 0) {
          player.setOption('captions', 'track', tracks[0]);
        }
      }
    } catch (e) {
      console.error('Duck Translate: Error enabling subtitles', e);
    }
  }
}

// Listen for messages from content script
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) {
    return;
  }
  
  const message = event.data;
  if (!message || !message.requestId) {
    return;
  }
  
  if (message.type === PLAYER_DATA_REQUEST_TYPE) {
    const playerData = getPlayerData();
    const response = {
      type: PLAYER_DATA_RESPONSE_TYPE,
      requestId: message.requestId,
      success: !!playerData,
      data: playerData
    };
    window.postMessage(response, window.location.origin);
  }
  
  else if (message.type === ENSURE_SUBTITLES_REQUEST_TYPE) {
    ensureSubtitlesEnabled();
    const response = {
      type: ENSURE_SUBTITLES_RESPONSE_TYPE,
      requestId: message.requestId,
      success: true
    };
    window.postMessage(response, window.location.origin);
  }
  
  else if (message.type === WAIT_TIMEDTEXT_REQUEST_TYPE) {
    // For now, just return null
    const response = {
      type: WAIT_TIMEDTEXT_RESPONSE_TYPE,
      requestId: message.requestId,
      url: null
    };
    window.postMessage(response, window.location.origin);
  }
});

console.log('Duck Translate: YouTube player data injector loaded');
