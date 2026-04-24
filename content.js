// Duck Translate - Content Script

(function() {
  'use strict';

  let currentPopup = null;
  let cachedSettings = null;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let currentAudio = null;

  // YouTube subtitle translation
  const SUBTITLE_MESSAGE_CHANNEL = 'duck-subtitle-inject';
  let subtitleConfig = {
    enabled: true,
    sourceLang: 'auto',
    targetLang: 'zh-CN'
  };

  // Handle messages from inject.js
  function setupMessageBridge() {
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.eventType !== SUBTITLE_MESSAGE_CHANNEL) return;
      if (data.to !== 'content-script') return;

      const { type, id, isAsync } = data;

      if (type === 'getConfig') {
        const response = { ...subtitleConfig };
        if (isAsync) {
          window.postMessage({
            eventType: SUBTITLE_MESSAGE_CHANNEL,
            to: 'inject',
            from: 'content-script',
            type: 'config',
            data: response,
            id: id
          }, '*');
        }
      } else if (type === 'requestSubtitle') {
        handleSubtitleTranslation(data.data, id, isAsync);
      } else if (type === 'contentReady') {
        window.postMessage({
          eventType: SUBTITLE_MESSAGE_CHANNEL,
          to: 'inject',
          from: 'content-script',
          type: 'contentReadyAck',
          data: true,
          id: id
        }, '*');
      }
    });
  }

  async function handleSubtitleTranslation(data, id, isAsync) {
    const { url, responseText } = data;

    try {
      let subtitleContent = responseText;
      if (!subtitleContent && url) {
        const response = await fetch(url);
        subtitleContent = await response.text();
      }

      if (!subtitleContent) {
        sendSubtitleResponse({ success: false, error: 'No subtitle content' }, id, isAsync);
        return;
      }

      const result = await translateText(subtitleContent);
      sendSubtitleResponse({ success: true, translatedContent: result }, id, isAsync);
    } catch (error) {
      sendSubtitleResponse({ success: false, error: error.message }, id, isAsync);
    }
  }

  function sendSubtitleResponse(data, id, isAsync) {
    if (isAsync) {
      window.postMessage({
        eventType: SUBTITLE_MESSAGE_CHANNEL,
        to: 'inject',
        from: 'content-script',
        type: 'subtitleResult',
        data: data,
        id: id
      }, '*');
    }
  }

  async function translateText(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        sourceLang: subtitleConfig.sourceLang,
        targetLang: subtitleConfig.targetLang
      }, (response) => {
        if (response && response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error || 'Translation failed'));
        }
      });
    });
  }

  function injectScript(scriptContent) {
    const script = document.createElement('script');
    script.textContent = scriptContent;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  function getInjectScript() {
    return '(' + function() {
      var CHANNEL = 'duck-subtitle-inject';
      var SUBTITLE_REGEX = /youtube\.com.*timedtext/;

      var originalXHROpen = XMLHttpRequest.prototype.open;
      var originalXHRSend = XMLHttpRequest.prototype.send;

      function sendMessage(data) {
        return new Promise(function(resolve) {
          var id = Date.now() + Math.random();
          window.postMessage({
            eventType: CHANNEL,
            to: 'content-script',
            from: 'inject',
            type: data.type,
            data: data.data,
            id: id,
            isAsync: true
          }, '*');

          var handler = function(event) {
            if (event.data.eventType === CHANNEL &&
                event.data.to === 'inject' &&
                event.data.id === id) {
              window.removeEventListener('message', handler);
              resolve(event.data.data);
            }
          };
          window.addEventListener('message', handler);
          setTimeout(function() {
            window.removeEventListener('message', handler);
            resolve(null);
          }, 5000);
        });
      }

      function waitForContentReady() {
        return new Promise(function(resolve) {
          window.postMessage({
            eventType: CHANNEL,
            to: 'content-script',
            from: 'inject',
            type: 'contentReady',
            data: true
          }, '*');

          var handler = function(event) {
            if (event.data.eventType === CHANNEL &&
                event.data.to === 'inject' &&
                event.data.type === 'contentReadyAck') {
              window.removeEventListener('message', handler);
              resolve(true);
            }
          };
          window.addEventListener('message', handler);
          setTimeout(function() { resolve(false); }, 5000);
        });
      }

      async function handleSubtitleRequest(url, responseText) {
        try {
          var result = await sendMessage({
            type: 'requestSubtitle',
            data: { url: url, responseText: responseText }
          });
          return result;
        } catch (e) {
          console.error('Duck Translate: Subtitle error', e);
          return null;
        }
      }

      XMLHttpRequest.prototype.open = function(method, url) {
        this._url = typeof url === 'string' ? url : url && url.href;
        this._method = method;
        return originalXHROpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function(data) {
        var url = this._url;

        if (url && SUBTITLE_REGEX.test(url)) {
          var self = this;
          this.addEventListener('readystatechange', async function() {
            if (self.readyState === 4 && self.status === 200) {
              var responseText = self.responseText;
              if (responseText && responseText.indexOf('-->') > -1) {
                var translated = await handleSubtitleRequest(url, responseText);
                if (translated && translated.success && translated.translatedContent) {
                  Object.defineProperty(self, 'responseText', {
                    value: translated.translatedContent,
                    writable: false
                  });
                  Object.defineProperty(self, 'response', {
                    value: translated.translatedContent,
                    writable: false
                  });
                }
              }
            }
          });
        }

        return originalXHRSend.apply(this, arguments);
      };

      var originalFetch = globalThis.fetch;
      globalThis.fetch = async function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url);

        if (url && SUBTITLE_REGEX.test(url)) {
          var response = await originalFetch(input, init);
          if (response.ok) {
            var text = await response.text();
            if (text && text.indexOf('-->') > -1) {
              var translated = await handleSubtitleRequest(url, text);
              if (translated && translated.success && translated.translatedContent) {
                return new Response(translated.translatedContent, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers
                });
              }
            }
          }
          return response;
        }

        return originalFetch.apply(this, arguments);
      };

      waitForContentReady().then(function(ready) {
        if (ready) {
          console.log('Duck Translate: YouTube subtitle initialized');
        }
      });
    } + ')();';
  }

  function initYouTubeSubtitle() {
    if (!window.location.hostname.includes('youtube.com')) return;
    if (!window.location.pathname.includes('/watch')) return;

    var checkReady = setInterval(function() {
      var player = document.querySelector('#movie_player');
      if (player && typeof player.getPlayerResponse === 'function') {
        clearInterval(checkReady);
        loadSettingsAndInit();
      }
    }, 1000);

    setTimeout(function() { clearInterval(checkReady); }, 30000);
  }

  async function loadSettingsAndInit() {
    var response = await new Promise(function(resolve) {
      chrome.runtime.sendMessage({ action: 'getSettings' }, resolve);
    });

    if (response && response.settings) {
      subtitleConfig.sourceLang = response.settings.sourceLang || 'auto';
      subtitleConfig.targetLang = response.settings.targetLang || 'zh-CN';
    }

    setupMessageBridge();
    injectScript(getInjectScript());

    setTimeout(function() {
      window.postMessage({
        eventType: SUBTITLE_MESSAGE_CHANNEL,
        to: 'inject',
        from: 'content-script',
        type: 'contentReady',
        data: true
      }, '*');
    }, 500);
  }

  document.addEventListener('contextmenu', function(e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  function loadSettings() {
    return new Promise(function(resolve) {
      chrome.runtime.sendMessage({ action: 'getSettings' }, function(response) {
        if (response && response.settings) {
          cachedSettings = response.settings;
        }
        resolve(cachedSettings);
      });
    });
  }

  function createPopup(x, y) {
    removePopup();

    var popup = document.createElement('div');
    popup.id = 'duck-translate-popup';
    popup.innerHTML = '<div class="duck-popup-header" style="cursor:move;">' +
      '<span class="duck-popup-title">Duck Translate</span>' +
      '<button class="duck-popup-close">&times;</button>' +
      '</div>' +
      '<div class="duck-popup-content">' +
      '<div class="duck-popup-loading">Translating...</div>' +
      '</div>';

    document.body.appendChild(popup);
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    adjustPopupPosition(popup);

    // Add drag functionality
    var header = popup.querySelector('.duck-popup-header');
    var isDragging = false;
    var dragOffsetX = 0;
    var dragOffsetY = 0;

    header.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('duck-popup-close')) return;
      isDragging = true;
      dragOffsetX = e.clientX - popup.offsetLeft;
      dragOffsetY = e.clientY - popup.offsetTop;
      popup.style.transition = 'none';
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var newX = e.clientX - dragOffsetX;
      var newY = e.clientY - dragOffsetY;
      popup.style.left = newX + 'px';
      popup.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', function() {
      isDragging = false;
    });

    popup.querySelector('.duck-popup-close').addEventListener('click', function(e) {
      e.stopPropagation();
      removePopup();
    });

    setTimeout(function() {
      document.addEventListener('click', handleOutsideClick);
    }, 100);

    return popup;
  }

  function removePopup() {
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
    }
    document.removeEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(e) {
    if (currentPopup && !currentPopup.contains(e.target)) {
      removePopup();
    }
  }

  function adjustPopupPosition(popup) {
    var rect = popup.getBoundingClientRect();
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;

    var left = parseInt(popup.style.left) || 0;
    var top = parseInt(popup.style.top) || 0;

    if (left + rect.width > viewportWidth - 10) {
      left = left - rect.width - 20;
    }

    if (top + rect.height > viewportHeight - 10) {
      top = top - rect.height - 20;
    }

    if (left < 10) left = 10;
    if (top < 10) top = 10;

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  function showTranslation(text, result, error, targetLang, sourceAudioDataUrl, translationAudioDataUrl, ttsError, settings) {
    if (!currentPopup) return;
    if (error === undefined) error = null;
    if (ttsError === undefined) ttsError = null;
    var showPinyin = settings?.showPinyin !== false;
    var enableTTS = settings?.enableTTS !== false;

    var content = currentPopup.querySelector('.duck-popup-content');

    if (error) {
      content.innerHTML = '<div class="duck-popup-error">' + error + '</div>' +
        '<div class="duck-popup-actions">' +
        '<button class="duck-popup-btn" id="open-settings-btn">Open Settings</button>' +
        '</div>';
      content.querySelector('#open-settings-btn').addEventListener('click', function() {
        try {
          chrome.runtime.openOptionsPage();
        } catch (e) {
          window.open(chrome.runtime.getURL('options.html'), '_blank');
        }
      });
      return;
    }

    var sourceText = text.length > 100 ? text.substring(0, 100) + '...' : text;

    // Parse AI response to extract translation, pinyin/phonetic
    var parsed = parseAIResponse(result);
    var translationText = parsed.translation || result;
    var phoneticText = parsed.phonetic || '';

    var phoneticHtml = '';
    if (showPinyin && phoneticText) {
      phoneticHtml = '<div class="duck-popup-phonetic">' + escapeHtml(phoneticText) + '</div>';
    }

    var ttsHtml = '';
    if (enableTTS) {
      if (ttsError) {
        ttsHtml = '<div class="duck-popup-tts-error">🔊 TTS Error: ' + escapeHtml(ttsError) + '</div>';
      }
      // TTS is now generated on demand, so it's always available when enableTTS is true
    }

    var actionsHtml = '<button class="duck-popup-btn" data-action="copy">Copy</button>' +
      '<button class="duck-popup-btn primary" data-action="swap">Swap & Translate</button>';
    if (enableTTS) {
      actionsHtml = '<button class="duck-popup-btn" data-action="tts-source">🔊 原文</button>' +
                   '<button class="duck-popup-btn" data-action="tts-translation">🔊 译文</button>' +
                   actionsHtml;
    }

    content.innerHTML = '<div class="duck-popup-source">' + escapeHtml(sourceText) + '</div>' +
      '<div class="duck-popup-text">' + escapeHtml(translationText) + '</div>' +
      phoneticHtml +
      ttsHtml +
      '<div class="duck-popup-actions">' + actionsHtml + '</div>';

    // TTS button handlers - only if enableTTS is enabled
    if (enableTTS) {
      let ttsSourceTimeout = null;
      let ttsTranslationTimeout = null;
      
      // Source text TTS button (original text)
      var ttsSourceBtn = content.querySelector('[data-action="tts-source"]');
      if (ttsSourceBtn) {
        ttsSourceBtn.addEventListener('click', function() {
          var btn = this;
          
          // Debounce to prevent multiple rapid clicks
          clearTimeout(ttsSourceTimeout);
          ttsSourceTimeout = setTimeout(function() {
            // Use pre-generated audio if available
            if (sourceAudioDataUrl) {
              playAudio(sourceAudioDataUrl, btn, 'tts-source');
            } else {
              // Fall back to generating audio on demand via background
              btn.textContent = '🔊 播放中...';
              btn.disabled = true;
              
              console.log('Duck Translate: Generating TTS for source text:', text.substring(0, 30) + (text.length > 30 ? '...' : ''));
              
              chrome.runtime.sendMessage({
                action: 'generateTTS',
                text: text,  // Use original source text (full text)
                targetLang: targetLang || 'en' // Default to English for source
              }, function(response) {
                btn.textContent = '🔊 原文';
                btn.disabled = false;
                
                if (response && response.success && response.audioDataUrl) {
                  try {
                    playAudio(response.audioDataUrl, btn, 'tts-source');
                  } catch (error) {
                    console.error('Duck Translate: TTS playback error:', error);
                  }
                }
              });
            }
          }, 200); // 200ms debounce
        });
      }

      // Translation TTS button
      var ttsTranslationBtn = content.querySelector('[data-action="tts-translation"]');
      if (ttsTranslationBtn) {
        ttsTranslationBtn.addEventListener('click', function() {
          var btn = this;
          
          // Debounce to prevent multiple rapid clicks
          clearTimeout(ttsTranslationTimeout);
          ttsTranslationTimeout = setTimeout(function() {
            // Use pre-generated audio if available
            if (translationAudioDataUrl) {
              playAudio(translationAudioDataUrl, btn, 'tts-translation');
            } else {
              // Fall back to generating audio on demand via background
              btn.textContent = '🔊 播放中...';
              btn.disabled = true;
              
              console.log('Duck Translate: Generating TTS for translation text:', translationText.substring(0, 30) + (translationText.length > 30 ? '...' : ''));
              
              chrome.runtime.sendMessage({
                action: 'generateTTS',
                text: translationText,  // Use full translation text
                targetLang: targetLang || 'zh-CN'
              }, function(response) {
                btn.textContent = '🔊 译文';
                btn.disabled = false;
                
                if (response && response.success && response.audioDataUrl) {
                  try {
                    playAudio(response.audioDataUrl, btn, 'tts-translation');
                  } catch (error) {
                    console.error('Duck Translate: TTS playback error:', error);
                  }
                }
              });
            }
          }, 200); // 200ms debounce
        });
      }
    }

    // Helper function to play audio
    function playAudio(audioDataUrl, btn, actionType) {
      btn.textContent = '🔊 播放中...';
      btn.disabled = true;

      // Stop previous audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }

      try {
        currentAudio = new Audio(audioDataUrl);
        currentAudio.play().then(function() {
          console.log('Duck Translate: TTS playback started');
        }).catch(function(error) {
          console.error('Duck Translate: TTS playback error:', error);
          btn.textContent = actionType === 'tts-source' ? '🔊 原文' : '🔊 译文';
          btn.disabled = false;
        });
        
        currentAudio.onended = function() {
          btn.textContent = actionType === 'tts-source' ? '🔊 原文' : '🔊 译文';
          btn.disabled = false;
        };
        
        currentAudio.onerror = function(error) {
          console.error('Duck Translate: Audio error:', error);
          btn.textContent = actionType === 'tts-source' ? '🔊 原文' : '🔊 译文';
          btn.disabled = false;
        };
      } catch (error) {
        console.error('Duck Translate: TTS error:', error);
        btn.textContent = actionType === 'tts-source' ? '🔊 原文' : '🔊 译文';
        btn.disabled = false;
      }
    }

    content.querySelector('[data-action="copy"]').addEventListener('click', function() {
      navigator.clipboard.writeText(translationText).then(function() {
        var btn = content.querySelector('[data-action="copy"]');
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
      });
    });

    content.querySelector('[data-action="swap"]').addEventListener('click', function() {
      performTranslation(translationText, true);
    });
  }

  // Parse AI response to extract translation and phonetic
  function parseAIResponse(response) {
    var result = {
      translation: '',
      phonetic: ''
    };

    if (!response) return result;

    // Try to parse structured format
    var transMatch = response.match(/【翻译】\s*([\s\S]*?)(?=【拼音】|【音标】|$)/i);
    var pinyinMatch = response.match(/【拼音】\s*([\s\S]*?)(?=【发音】|【翻译】|$)/i);
    var ipaMatch = response.match(/【音标】\s*([\s\S]*?)(?=【发音】|【翻译】|$)/i);

    if (transMatch) {
      result.translation = transMatch[1].trim();
    }
    if (pinyinMatch) {
      result.phonetic = '拼音: ' + pinyinMatch[1].trim();
    } else if (ipaMatch) {
      result.phonetic = '音标: ' + ipaMatch[1].trim();
    }

    // If no structured format found, return as-is
    if (!result.translation) {
      result.translation = response;
    }

    return result;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function performTranslation(text, isSwap) {
    if (!text || text.trim().length === 0) return;
    if (isSwap === undefined) isSwap = false;

    if (!currentPopup) {
      var x, y;
      var selection = window.getSelection();

      if (selection && selection.rangeCount > 0) {
        var range = selection.getRangeAt(0);
        var rect = range.getBoundingClientRect();
        x = rect.right + 10;
        y = rect.top;
      } else {
        // For swap operation or when no selection, use current mouse position or last known position
        x = lastMouseX + 10;
        y = lastMouseY;
      }

      currentPopup = createPopup(x, y);
    }

    var content = currentPopup.querySelector('.duck-popup-content');
    content.innerHTML = '<div class="duck-popup-loading">Translating...</div>';

    try {
      var settings = await loadSettings();

      var sourceLang = isSwap ? (settings.targetLang === 'auto' ? 'auto' : settings.targetLang) : settings.sourceLang;
      var targetLang = isSwap ? (settings.sourceLang === 'auto' ? 'zh-CN' : settings.sourceLang) : settings.targetLang;

      var response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        sourceLang: sourceLang,
        targetLang: targetLang
      });

      if (response && response.success) {
        showTranslation(text, response.result, null, targetLang, null, null, null, settings);
      } else {
        showTranslation(text, null, response?.error || 'Translation failed', targetLang, null, null, null, settings);
      }
    } catch (error) {
      showTranslation(text, null, error.message || 'Translation failed');
    }
  }

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'showTranslation' && message.text) {
      performTranslation(message.text).then(function() {
        sendResponse({ success: true });
      });
      return true;
    }
    return false;
  });

  var selectionTimeout = null;
  var lastSelectedText = '';
  var lastSelectionTime = 0;
  var isMouseDown = false;
  var mouseDownTime = 0;
  
  // Mousedown handler to track selection start
  document.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return; // Only left mouse button
    isMouseDown = true;
    mouseDownTime = Date.now();
  });
  
  // Mouseup handler for selection
  document.addEventListener('mouseup', function(e) {
    if (e.button !== 0) return; // Only left mouse button
    if (e.target.closest('#duck-translate-popup')) return;
    
    // Minimum selection time to avoid accidental clicks
    var selectionTime = Date.now() - mouseDownTime;
    if (selectionTime < 100) return; // Ignore very quick clicks
    
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(function() {
      var selection = window.getSelection();
      var text = selection.toString().trim();
      var now = Date.now();

      // Only translate if:
      // 1. Text is not empty
      // 2. Text length is reasonable (1-5000 chars)
      // 3. Text is different from last translation
      // 4. Enough time has passed since last translation
      // 5. Selection is not just a single word (optional)
      if (text && 
          text.length > 0 && 
          text.length < 5000 && 
          text !== lastSelectedText && 
          (now - lastSelectionTime > 800)) {
        
        lastSelectedText = text;
        lastSelectionTime = now;
        
        // Small delay to ensure selection is complete
        setTimeout(function() {
          performTranslation(text);
        }, 150);
      }
    }, 600); // Increased timeout to 600ms for better debouncing
  });

  document.addEventListener('dblclick', function(e) {
    var selection = window.getSelection();
    var text = selection.toString().trim();

    if (text && text.length > 0 && text.length < 5000) {
      performTranslation(text);
    }
  });

  // Inject scripts for YouTube support
  function injectScripts() {
    if (window.location.href.includes('youtube.com/watch')) {
      // Inject YouTube player data script
      const injectScript = document.createElement('script');
      injectScript.src = chrome.runtime.getURL('youtube-inject.js');
      injectScript.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(injectScript);

      // Inject YouTube subtitles script
      const subtitlesScript = document.createElement('script');
      subtitlesScript.src = chrome.runtime.getURL('youtube-subtitles.js');
      subtitlesScript.onload = function() {
        this.remove();
        // Initialize YouTube subtitles after script is loaded
        if (window.initYouTubeSubtitle) {
          try {
            window.initYouTubeSubtitle();
          } catch (e) {
            console.error('Duck Translate: YouTube subtitles init error', e);
          }
        }
      };
      (document.head || document.documentElement).appendChild(subtitlesScript);
    }
  }

  // Initialize YouTube subtitle support (non-blocking)
  try {
    injectScripts();
  } catch (e) {
    console.error('Duck Translate: Init error', e);
  }
})();
