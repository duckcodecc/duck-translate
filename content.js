// Duck Translate - Content Script
(function() {
  'use strict';

  var currentPopup = null;
  var currentAudio = null;
  var lastMouseX = 0;
  var lastMouseY = 0;

  // Track mouse position
  document.addEventListener('mousemove', function(e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  // Inject styles
  var style = document.createElement('style');
  style.textContent = `
    /* Duck Translate - Content Script Styles */
    #duck-selection-toolbar {
      position: absolute;
      z-index: 2147483646; /* Lower than popup */
      background: linear-gradient(135deg, #ffb347 0%, #ffcc5c 100%);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(139, 90, 43, 0.2);
      padding: 6px 8px;
      opacity: 0;
      pointer-events: none;
      transform: translateY(5px);
      transition: opacity 0.2s, transform 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    #duck-selection-toolbar.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
    .duck-toolbar-buttons {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .duck-toolbar-btn {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      background: transparent;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      padding: 0;
    }
    .duck-toolbar-btn:hover {
      background: rgba(255, 255, 255, 0.5);
      transform: scale(1.1);
    }
    .duck-toolbar-btn:active {
      transform: scale(0.95);
    }
    #duck-translate-popup {
      position: fixed;
      z-index: 2147483647; /* Higher than toolbar */
      background: #fffdf8;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(139, 90, 43, 0.18), 0 2px 8px rgba(0,0,0,0.08);
      max-width: 380px;
      min-width: 280px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #5a4a3a;
      border: 2px solid #f5efe0;
      overflow: hidden;
      transition: all 0.2s ease;
      animation: duckSlideIn 0.2s ease-out;
    }
    @keyframes duckSlideIn {
      from { opacity: 0; transform: translateY(10px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .duck-popup-header {
      background: linear-gradient(135deg, #ffb347 0%, #ffcc5c 100%);
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #f5efe0;
    }
    .duck-popup-title { font-weight: 700; font-size: 14px; color: #6b5344; text-shadow: 0 1px 2px rgba(255,255,255,0.5); }
    .duck-popup-close {
      background: none; border: none; font-size: 20px; line-height: 1; cursor: pointer; color: #6b5344;
      padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
      border-radius: 4px; transition: all 0.2s;
    }
    .duck-popup-close:hover { background: rgba(107, 83, 68, 0.1); transform: scale(1.1); }
    .duck-popup-content { padding: 16px; max-height: 300px; overflow-y: auto; }
    .duck-popup-loading { text-align: center; color: #8b7355; padding: 20px 0; font-style: italic; }
    .duck-popup-error { background: #fff3e0; color: #e65100; padding: 12px; border-radius: 8px; border: 1px solid #ffe0b2; margin-bottom: 12px; font-size: 13px; }
    .duck-popup-tts-error { background: #fff3e0; color: #e65100; padding: 8px 12px; border-radius: 6px; border: 1px solid #ffe0b2; margin: 8px 0; font-size: 12px; display: flex; align-items: center; gap: 6px; }
    .duck-popup-source { font-size: 13px; color: #8b7355; margin-bottom: 8px; line-height: 1.4; padding-bottom: 8px; border-bottom: 1px dashed #f0e6d3; }
    .duck-popup-text { font-size: 15px; font-weight: 500; color: #5a4a3a; margin-bottom: 12px; line-height: 1.5; min-height: 40px; }
    .duck-popup-phonetic { font-size: 12px; color: #8b7355; margin: 8px 0; padding: 6px 10px; background: #fff8e1; border-radius: 6px; border: 1px solid #ffe082; font-style: italic; }
    .duck-popup-actions { display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #f0e6d3; }
    .duck-popup-btn { flex: 1; padding: 8px 12px; border: 2px solid #f0e6d3; border-radius: 8px; background: #fffdf8; color: #5a4a3a; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; text-align: center; }
    .duck-popup-btn:hover { border-color: #ffb347; background: #fff8e1; transform: translateY(-1px); box-shadow: 0 2px 4px rgba(255, 179, 71, 0.2); }
    .duck-popup-btn.primary { background: linear-gradient(135deg, #ffb347 0%, #ffcc5c 100%); border-color: #ffb347; color: #6b5344; font-weight: 700; }
    .duck-popup-btn.primary:hover { background: linear-gradient(135deg, #ff9500 0%, #ffb347 100%); border-color: #ff9500; box-shadow: 0 4px 8px rgba(255, 149, 0, 0.3); }
    .duck-popup-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
    .duck-popup-content::-webkit-scrollbar { width: 6px; }
    .duck-popup-content::-webkit-scrollbar-track { background: transparent; }
    .duck-popup-content::-webkit-scrollbar-thumb { background: #f0e6d3; border-radius: 3px; }
    .duck-popup-content::-webkit-scrollbar-thumb:hover { background: #ffe0a0; }
  `;
  document.head.appendChild(style);

  // Selection Toolbar implementation
  var selectionToolbar = null;
  var selectionToolbarVisible = false;

  function createSelectionToolbar() {
    var existingToolbar = document.getElementById('duck-selection-toolbar');
    if (existingToolbar) {
      existingToolbar.remove();
    }

    selectionToolbar = document.createElement('div');
    selectionToolbar.id = 'duck-selection-toolbar';
    selectionToolbar.innerHTML = 
      '<div class="duck-toolbar-buttons">' +
        '<button class="duck-toolbar-btn" id="duck-toolbar-translate" title="翻译">🔄</button>' +
        '<button class="duck-toolbar-btn" id="duck-toolbar-speak" title="朗读">🔊</button>' +
        '<button class="duck-toolbar-btn" id="duck-toolbar-close" title="关闭">❌</button>' +
      '</div>';
    
    document.body.appendChild(selectionToolbar);

    // Translate button
    selectionToolbar.querySelector('#duck-toolbar-translate').addEventListener('click', function(e) {
      e.stopPropagation();
      var selectedText = window.getSelection().toString().trim();
      if (selectedText) {
        hideSelectionToolbar(function() {
          performTranslation(selectedText);
        });
      }
    });

    // Speak button - use Web Speech API for local TTS
    selectionToolbar.querySelector('#duck-toolbar-speak').addEventListener('click', function(e) {
      e.stopPropagation();
      var selectedText = window.getSelection().toString().trim();
      if (selectedText) {
        hideSelectionToolbar(function() {
          if ('speechSynthesis' in window) {
            var utterance = new SpeechSynthesisUtterance(selectedText);
            utterance.lang = 'en-US';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            speechSynthesis.speak(utterance);
          }
        });
      }
    });

    // Close button
    selectionToolbar.querySelector('#duck-toolbar-close').addEventListener('click', function(e) {
      e.stopPropagation();
      hideSelectionToolbar();
    });

    // Prevent clicks from clearing selection
    selectionToolbar.addEventListener('mousedown', function(e) {
      e.preventDefault();
    });
  }

  function getSelectionDirection(startX, startY, endX, endY) {
    var isRightward = startX <= endX;
    var isDownward = startY <= endY + 8;
    
    if (isRightward && isDownward) return 'bottom-right';
    if (isRightward && !isDownward) return 'top-right';
    if (!isRightward && isDownward) return 'bottom-left';
    return 'top-left';
  }

  function showSelectionToolbar(anchorX, anchorY, startX, startY) {
    if (!selectionToolbar) {
      createSelectionToolbar();
    }

    var selection = window.getSelection();
    var text = selection ? selection.toString().trim() : '';
    if (!text) {
      hideSelectionToolbar();
      return;
    }

    var toolbarWidth = selectionToolbar.offsetWidth || 120;
    var toolbarHeight = selectionToolbar.offsetHeight || 40;
    var direction = getSelectionDirection(startX, startY, anchorX, anchorY);
    var scrollX = window.scrollX || window.pageXOffset;
    var scrollY = window.scrollY || window.pageYOffset;
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;

    var posX, posY;
    var cursorClearance = 15;

    switch (direction) {
      case 'bottom-right':
        posX = anchorX + scrollX;
        posY = anchorY + scrollY + cursorClearance;
        break;
      case 'bottom-left':
        posX = anchorX + scrollX - toolbarWidth;
        posY = anchorY + scrollY + cursorClearance;
        break;
      case 'top-right':
        posX = anchorX + scrollX;
        posY = anchorY + scrollY - toolbarHeight - cursorClearance;
        break;
      case 'top-left':
        posX = anchorX + scrollX - toolbarWidth;
        posY = anchorY + scrollY - toolbarHeight - cursorClearance;
        break;
    }

    posX = Math.max(10, Math.min(viewportWidth - toolbarWidth - 10, posX));
    posY = Math.max(10, Math.min(viewportHeight - toolbarHeight - 10 + scrollY, posY));

    selectionToolbar.style.left = posX + 'px';
    selectionToolbar.style.top = posY + 'px';
    selectionToolbar.classList.add('visible');

    selectionToolbarVisible = true;
  }

  function hideSelectionToolbar(callback) {
    if (selectionToolbar) {
      selectionToolbar.classList.remove('visible');
      // Wait for animation to complete before callback
      setTimeout(function() {
        if (callback) {
          callback();
        }
      }, 250); // Match CSS transition duration
    } else if (callback) {
      callback();
    }
    selectionToolbarVisible = false;
  }

  function createPopup(x, y) {
    var existingPopup = document.getElementById('duck-translate-popup');
    if (existingPopup) {
      existingPopup.remove();
    }

    var popup = document.createElement('div');
    popup.id = 'duck-translate-popup';
    popup.innerHTML = 
      '<div class="duck-popup-header">' +
        '<span class="duck-popup-title">🦆 Duck Translate</span>' +
        '<button class="duck-popup-close" id="duck-popup-close">×</button>' +
      '</div>' +
      '<div class="duck-popup-content">Loading...</div>';
    
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    document.body.appendChild(popup);

    document.getElementById('duck-popup-close').addEventListener('click', function() {
      closePopup();
    });

    return popup;
  }

  function closePopup() {
    var popup = document.getElementById('duck-translate-popup');
    if (popup) {
      popup.remove();
    }
    currentPopup = null;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  }

  async function loadSettings() {
    return new Promise(function(resolve) {
      chrome.runtime.sendMessage({ action: 'getSettings' }, function(response) {
        resolve(response.settings || {
          apiKey: '',
          sourceLang: 'auto',
          targetLang: 'zh-CN',
          enableTTS: true,
          showPinyin: true
        });
      });
    });
  }

  function parseAIResponse(response) {
    var result = { translation: '', phonetic: '' };
    if (!response) return result;

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
      var targetLang = isSwap ? settings.sourceLang : settings.targetLang;

      chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        sourceLang: sourceLang,
        targetLang: targetLang
      }, function(response) {
        if (response && response.success) {
          showTranslation(text, response.result, null, targetLang, null, null, null, settings);
        } else {
          showTranslation(text, null, response?.error || 'Translation failed', targetLang, null, null, null, settings);
        }
      });
    } catch (error) {
      showTranslation(text, null, error.message || 'Translation failed');
    }
  }

  function showTranslation(text, result, error, targetLang, sourceAudioDataUrl, translationAudioDataUrl, ttsError, settings) {
    if (!currentPopup) return;

    var content = currentPopup.querySelector('.duck-popup-content');
    if (error) {
      content.innerHTML = '<div class="duck-popup-error">' + escapeHtml(error) + '</div>';
      return;
    }

    var parsed = parseAIResponse(result);
    var translationText = parsed.translation || result;
    var phoneticText = parsed.phonetic || '';

    var phoneticHtml = '';
    if (settings.showPinyin && phoneticText) {
      phoneticHtml = '<div class="duck-popup-phonetic">' + escapeHtml(phoneticText) + '</div>';
    }

    var ttsHtml = '';
    if (settings.enableTTS) {
      if (ttsError) {
        ttsHtml = '<div class="duck-popup-tts-error">🔊 TTS Error: ' + escapeHtml(ttsError) + '</div>';
      }
    }

    var actionsHtml = '<button class="duck-popup-btn" data-action="copy">Copy</button>' +
      '<button class="duck-popup-btn primary" data-action="swap">Swap & Translate</button>';
    if (settings.enableTTS) {
      actionsHtml = '<button class="duck-popup-btn" data-action="tts-source">🔊 原文</button>' +
                   '<button class="duck-popup-btn" data-action="tts-translation">🔊 译文</button>' +
                   actionsHtml;
    }

    content.innerHTML = '<div class="duck-popup-source">' + escapeHtml(text) + '</div>' +
      '<div class="duck-popup-text">' + escapeHtml(translationText) + '</div>' +
      phoneticHtml +
      ttsHtml +
      '<div class="duck-popup-actions">' + actionsHtml + '</div>';

    // TTS button handlers
    if (settings.enableTTS) {
      var ttsSourceBtn = content.querySelector('[data-action="tts-source"]');
      if (ttsSourceBtn) {
        ttsSourceBtn.addEventListener('click', function() {
          var btn = this;
          btn.textContent = '🔊 播放中...';
          btn.disabled = true;
          
          chrome.runtime.sendMessage({
            action: 'generateTTS',
            text: text,
            targetLang: targetLang || 'en'
          }, function(response) {
            btn.textContent = '🔊 原文';
            btn.disabled = false;
            
            if (response && response.success && response.audioDataUrl) {
              try {
                if (currentAudio) {
                  currentAudio.pause();
                }
                currentAudio = new Audio(response.audioDataUrl);
                currentAudio.play().catch(function(error) {
                  console.error('Duck Translate: Audio error:', error);
                });
                currentAudio.onended = function() {
                  btn.textContent = '🔊 原文';
                };
              } catch (error) {
                console.error('Duck Translate: TTS playback error:', error);
              }
            }
          });
        });
      }

      var ttsTranslationBtn = content.querySelector('[data-action="tts-translation"]');
      if (ttsTranslationBtn) {
        ttsTranslationBtn.addEventListener('click', function() {
          var btn = this;
          btn.textContent = '🔊 播放中...';
          btn.disabled = true;
          
          chrome.runtime.sendMessage({
            action: 'generateTTS',
            text: translationText,
            targetLang: targetLang || 'zh-CN'
          }, function(response) {
            btn.textContent = '🔊 译文';
            btn.disabled = false;
            
            if (response && response.success && response.audioDataUrl) {
              try {
                if (currentAudio) {
                  currentAudio.pause();
                }
                currentAudio = new Audio(response.audioDataUrl);
                currentAudio.play().catch(function(error) {
                  console.error('Duck Translate: Audio error:', error);
                });
                currentAudio.onended = function() {
                  btn.textContent = '🔊 译文';
                };
              } catch (error) {
                console.error('Duck Translate: TTS playback error:', error);
              }
            }
          });
        });
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

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'showTranslation' && message.text) {
      performTranslation(message.text).then(function() {
        sendResponse({ success: true });
      });
      return true;
    }
    return false;
  });

  // Selection toolbar state
  var selectionTimeout = null;
  var lastSelectedText = '';
  var lastSelectionTime = 0;
  var isMouseDown = false;
  var mouseDownTime = 0;
  var selectionStartX = 0;
  var selectionStartY = 0;

  // Mousedown handler
  document.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    if (e.target.closest('#duck-selection-toolbar')) {
      return;
    }
    if (e.target.closest('#duck-translate-popup')) {
      return;
    }
    isMouseDown = true;
    mouseDownTime = Date.now();
    selectionStartX = e.clientX;
    selectionStartY = e.clientY;
    hideSelectionToolbar();
    if (currentPopup && !e.target.closest('#duck-translate-popup')) {
      closePopup();
    }
  });

  // Mouseup handler
  document.addEventListener('mouseup', function(e) {
    if (e.button !== 0) return;
    if (e.target.closest('#duck-selection-toolbar')) return;
    if (e.target.closest('#duck-translate-popup')) return;
    
    var selectionTime = Date.now() - mouseDownTime;
    if (selectionTime < 100) return;
    
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(function() {
      var selection = window.getSelection();
      var text = selection.toString().trim();
      var now = Date.now();

      if (text && text.length > 0 && text.length < 5000 && text !== lastSelectedText && (now - lastSelectionTime > 800)) {
        lastSelectedText = text;
        lastSelectionTime = now;
        
        setTimeout(function() {
          showSelectionToolbar(e.clientX, e.clientY, selectionStartX, selectionStartY);
        }, 150);
      } else if (!text) {
        hideSelectionToolbar();
      }
    }, 600);
  });

  // Hide toolbar on scroll
  window.addEventListener('scroll', function() {
    hideSelectionToolbar();
  }, { passive: true });

  // Double-click to translate word
  document.addEventListener('dblclick', function(e) {
    var selection = window.getSelection();
    var text = selection.toString().trim();
    if (text && text.length < 100) {
      hideSelectionToolbar(function() {
        performTranslation(text);
      });
    }
  });

  console.log('Duck Translate content script loaded');
})();
