// Duck Translate - Content Script

(function() {
  'use strict';

  let currentPopup = null;
  let cachedSettings = null;
  let lastMouseX = 0;
  let lastMouseY = 0;

  document.addEventListener('contextmenu', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        if (response && response.settings) {
          cachedSettings = response.settings;
        }
        resolve(cachedSettings);
      });
    });
  }

  function createPopup(x, y) {
    removePopup();

    const popup = document.createElement('div');
    popup.id = 'duck-translate-popup';
    popup.innerHTML = `
      <div class="duck-popup-header">
        <span class="duck-popup-title">Duck Translate</span>
        <button class="duck-popup-close">&times;</button>
      </div>
      <div class="duck-popup-content">
        <div class="duck-popup-loading">Translating...</div>
      </div>
    `;

    document.body.appendChild(popup);
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    adjustPopupPosition(popup);

    popup.querySelector('.duck-popup-close').addEventListener('click', (e) => {
      e.stopPropagation();
      removePopup();
    });

    setTimeout(() => {
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
    const rect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = parseInt(popup.style.left) || 0;
    let top = parseInt(popup.style.top) || 0;

    if (left + rect.width > viewportWidth - 10) {
      left = left - rect.width - 20;
    }

    if (top + rect.height > viewportHeight - 10) {
      top = top - rect.height - 20;
    }

    if (left < 10) left = 10;
    if (top < 10) top = 10;

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function showTranslation(text, result, error = null) {
    if (!currentPopup) return;

    const content = currentPopup.querySelector('.duck-popup-content');

    if (error) {
      content.innerHTML = `
        <div class="duck-popup-error">${error}</div>
        <div class="duck-popup-actions">
          <button class="duck-popup-btn" id="open-settings-btn">⚙️ Open Settings</button>
        </div>
      `;
      content.querySelector('#open-settings-btn').addEventListener('click', () => {
        try {
          chrome.runtime.openOptionsPage();
        } catch (e) {
          // 备选方案：直接打开选项页面
          window.open(chrome.runtime.getURL('options.html'), '_blank');
        }
      });
      return;
    }

    content.innerHTML = `
      <div class="duck-popup-source">${text.substring(0, 100)}${text.length > 100 ? '...' : ''}</div>
      <div class="duck-popup-text">${result}</div>
      <div class="duck-popup-actions">
        <button class="duck-popup-btn" data-action="copy">Copy</button>
        <button class="duck-popup-btn primary" data-action="swap">Swap & Translate</button>
      </div>
    `;

    content.querySelector('[data-action="copy"]').addEventListener('click', () => {
      navigator.clipboard.writeText(result).then(() => {
        const btn = content.querySelector('[data-action="copy"]');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      });
    });

    content.querySelector('[data-action="swap"]').addEventListener('click', () => {
      performTranslation(result, true);
    });
  }

  async function performTranslation(text, isSwap = false) {
    if (!text || text.trim().length === 0) return;

    if (!currentPopup) {
      let x, y;
      const selection = window.getSelection();

      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        x = rect.right + 10;
        y = rect.top;
      } else {
        x = lastMouseX + 10;
        y = lastMouseY;
      }

      currentPopup = createPopup(x, y);
    }

    const content = currentPopup.querySelector('.duck-popup-content');
    content.innerHTML = '<div class="duck-popup-loading">Translating...</div>';

    try {
      const settings = await loadSettings();

      const sourceLang = isSwap ? (settings.targetLang === 'auto' ? 'auto' : settings.targetLang) : settings.sourceLang;
      const targetLang = isSwap ? (settings.sourceLang === 'auto' ? 'zh-CN' : settings.sourceLang) : settings.targetLang;

      const response = await chrome.runtime.sendMessage({
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'showTranslation' && message.text) {
      performTranslation(message.text).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }
    return false;
  });

  let selectionTimeout = null;
  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('#duck-translate-popup')) return;

    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text && text.length > 0 && text.length < 5000) {
        setTimeout(() => {
          performTranslation(text);
        }, 100);
      }
    }, 300);
  });

  document.addEventListener('dblclick', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text && text.length > 0 && text.length < 5000) {
      performTranslation(text);
    }
  });
})();
