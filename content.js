// Duck Translate - Content Script

(function() {
  'use strict';

  let currentPopup = null;
  let cachedSettings = null;
  let lastMouseX = 0;
  let lastMouseY = 0;

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

  function showTranslation(text, result, error) {
    if (!currentPopup) return;
    if (error === undefined) error = null;

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
    content.innerHTML = '<div class="duck-popup-source">' + sourceText + '</div>' +
      '<div class="duck-popup-text">' + result + '</div>' +
      '<div class="duck-popup-actions">' +
      '<button class="duck-popup-btn" data-action="copy">Copy</button>' +
      '<button class="duck-popup-btn primary" data-action="swap">Swap & Translate</button>' +
      '</div>';

    content.querySelector('[data-action="copy"]').addEventListener('click', function() {
      navigator.clipboard.writeText(result).then(function() {
        var btn = content.querySelector('[data-action="copy"]');
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
      });
    });

    content.querySelector('[data-action="swap"]').addEventListener('click', function() {
      performTranslation(result, true);
    });
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
        showTranslation(text, response.result);
      } else {
        showTranslation(text, null, response?.error || 'Translation failed');
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
  document.addEventListener('mouseup', function(e) {
    if (e.target.closest('#duck-translate-popup')) return;

    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(function() {
      var selection = window.getSelection();
      var text = selection.toString().trim();

      if (text && text.length > 0 && text.length < 5000) {
        setTimeout(function() {
          performTranslation(text);
        }, 100);
      }
    }, 300);
  });

  document.addEventListener('dblclick', function(e) {
    var selection = window.getSelection();
    var text = selection.toString().trim();

    if (text && text.length > 0 && text.length < 5000) {
      performTranslation(text);
    }
  });

  // Initialize YouTube subtitle support (non-blocking)
  try {
    initYouTubeSubtitle();
  } catch (e) {
    console.error('Duck Translate: Init error', e);
  }
})();
