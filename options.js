// Duck Translate - Options Page Script

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const sourceLangSelect = document.getElementById('sourceLang');
  const targetLangSelect = document.getElementById('targetLang');
  const saveBtn = document.getElementById('saveBtn');
  const statusMessage = document.getElementById('statusMessage');

  console.log('Duck Translate Options: page loaded');

  // 加载当前设置
  async function loadSettings() {
    console.log('Duck Translate Options: loading settings...');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
      console.log('Duck Translate Options: getSettings response:', response);

      if (response && response.settings) {
        apiKeyInput.value = response.settings.apiKey || '';
        sourceLangSelect.value = response.settings.sourceLang || 'auto';
        targetLangSelect.value = response.settings.targetLang || 'zh-CN';
        console.log('Duck Translate Options: settings loaded successfully');
      } else {
        console.log('Duck Translate Options: no settings found, using defaults');
      }
    } catch (error) {
      console.error('Duck Translate Options: Failed to load settings:', error);
      showStatus('Failed to load settings: ' + error.message, 'error');
    }
  }

  // 显示状态消息
  function showStatus(message, type = 'success') {
    console.log('Duck Translate Options: showing status:', message, type);
    statusMessage.textContent = message;
    statusMessage.className = `status-message show ${type}`;

    setTimeout(() => {
      statusMessage.classList.remove('show');
    }, 5000);
  }

  // 保存设置
  async function saveSettings() {
    const settings = {
      apiKey: apiKeyInput.value.trim(),
      sourceLang: sourceLangSelect.value,
      targetLang: targetLangSelect.value
    };

    console.log('Duck Translate Options: saving settings:', settings);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: settings
      });

      console.log('Duck Translate Options: saveSettings response:', response);

      if (response && response.success) {
        showStatus('Settings saved successfully!', 'success');
      } else {
        showStatus(response?.error || 'Failed to save settings', 'error');
      }
    } catch (error) {
      console.error('Duck Translate Options: Failed to save settings:', error);
      showStatus('Failed to save settings: ' + error.message, 'error');
    }
  }

  // 保存按钮点击
  saveBtn.addEventListener('click', () => {
    console.log('Duck Translate Options: save button clicked');
    saveSettings();
  });

  // 键盘快捷键 Ctrl+S 保存
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      console.log('Duck Translate Options: Ctrl+S pressed');
      saveSettings();
    }
  });

  // 初始化加载设置
  await loadSettings();
});
