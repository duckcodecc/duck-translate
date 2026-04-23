// Duck Translate - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const textInput = document.getElementById('text');
  const sourceLangSelect = document.getElementById('sourceLang');
  const targetLangSelect = document.getElementById('targetLang');
  const translateBtn = document.getElementById('translateBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const openSettingsLink = document.getElementById('openSettings');
  const statusDiv = document.getElementById('status');

  // 加载设置
  let settings = {
    apiKey: '',
    sourceLang: 'auto',
    targetLang: 'zh-CN'
  };

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response && response.settings) {
      settings = response.settings;
      sourceLangSelect.value = settings.sourceLang || 'auto';
      targetLangSelect.value = settings.targetLang || 'zh-CN';
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  // 显示状态消息
  function showStatus(message, type = 'error') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.classList.remove('hidden');
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 5000);
  }

  // 翻译按钮点击
  translateBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();

    if (!text) {
      showStatus('Please enter text to translate');
      return;
    }

    if (!settings.apiKey) {
      showStatus('Please set your MiniMax API key in Settings');
      return;
    }

    translateBtn.disabled = true;
    translateBtn.textContent = 'Translating...';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        sourceLang: sourceLangSelect.value,
        targetLang: targetLangSelect.value
      });

      if (response.success) {
        // 复制结果到剪贴板
        await navigator.clipboard.writeText(response.result);
        showStatus('Translation copied to clipboard!', 'success');
        textInput.value = response.result;
      } else {
        showStatus(response.error || 'Translation failed');
      }
    } catch (error) {
      showStatus(error.message || 'Translation failed');
    } finally {
      translateBtn.disabled = false;
      translateBtn.textContent = 'Translate';
    }
  });

  // 打开设置页面
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  openSettingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // 监听来自 content script 的翻译请求结果
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'translationComplete' && message.result) {
      textInput.value = message.result;
    }
    return true;
  });
});
