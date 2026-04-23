// Duck Translate - Background Service Worker

const MINIMAX_API_URL = 'https://api.minimaxi.com/anthropic/v1/messages';
const STORAGE_KEY = 'duck_translate_settings';

const DEFAULT_SETTINGS = {
  apiKey: '',
  sourceLang: 'auto',
  targetLang: 'zh-CN',
  popupPosition: 'bottom'
};

const LANGUAGES = {
  'auto': { name: 'Auto Detect', name_zh: '自动检测' },
  'zh-CN': { name: 'Chinese (Simplified)', name_zh: '简体中文' },
  'zh-TW': { name: 'Chinese (Traditional)', name_zh: '繁體中文' },
  'en': { name: 'English', name_zh: '英语' },
  'ja': { name: 'Japanese', name_zh: '日语' },
  'ko': { name: 'Korean', name_zh: '韩语' },
  'fr': { name: 'French', name_zh: '法语' },
  'de': { name: 'German', name_zh: '德语' },
  'es': { name: 'Spanish', name_zh: '西班牙语' },
  'ru': { name: 'Russian', name_zh: '俄语' },
  'ar': { name: 'Arabic', name_zh: '阿拉伯语' },
  'pt': { name: 'Portuguese', name_zh: '葡萄牙语' },
  'it': { name: 'Italian', name_zh: '意大利语' },
  'th': { name: 'Thai', name_zh: '泰语' },
  'vi': { name: 'Vietnamese', name_zh: '越南语' },
  'id': { name: 'Indonesian', name_zh: '印尼语' },
  'ms': { name: 'Malay', name_zh: '马来语' }
};

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const settings = result[STORAGE_KEY] || DEFAULT_SETTINGS;
      resolve({ ...DEFAULT_SETTINGS, ...settings });
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: settings }, resolve);
  });
}

async function translateWithMiniMax(text, sourceLang, targetLang, apiKey) {
  if (!apiKey) {
    throw new Error('API key is required. Please set your MiniMax API key in settings.');
  }

  const systemPrompt = `You are a professional, accurate translator.

Translate the text from ${sourceLang === 'auto' ? 'the detected source language' : LANGUAGES[sourceLang]?.name || sourceLang} to ${LANGUAGES[targetLang]?.name || targetLang}.
Preserve the original tone, style, and nuance. Maintain proper formatting and punctuation.
Output ONLY the translation, without any explanations or additional text.`;

  const response = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      system: systemPrompt,
      messages: [
        { role: 'user', content: text }
      ],
      temperature: 0.3,
      thinking: {
        type: "disabled"
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
  }

  const data = await response.json();

  let translation = '';
  if (Array.isArray(data.content)) {
    const textItem = data.content.find(item => item.type === 'text');
    translation = textItem?.text?.trim() || '';
  }
  translation = translation || data.content?.[0]?.text?.trim() || '';

  if (!translation) {
    throw new Error('Empty response from translation API');
  }

  return translation;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslate(request, sender, sendResponse);
    return true;
  }
  if (request.action === 'getLanguages') {
    sendResponse({ languages: LANGUAGES });
    return true;
  }
  if (request.action === 'getSettings') {
    getSettings().then(settings => sendResponse({ settings }));
    return true;
  }
  if (request.action === 'saveSettings') {
    saveSettings(request.settings)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  return false;
});

async function handleTranslate(request, sender, sendResponse) {
  try {
    const settings = await getSettings();
    const { text, sourceLang, targetLang } = request;

    const result = await translateWithMiniMax(
      text,
      sourceLang || settings.sourceLang,
      targetLang || settings.targetLang,
      settings.apiKey
    );

    sendResponse({ success: true, result });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'duck-translate-selection' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'showTranslation',
      text: info.selectionText
    }).catch(() => {});
  }
});

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'duck-translate-selection',
      title: '🦆 Translate with Duck',
      contexts: ['selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

createContextMenu();
