// Duck Translate - Background Service Worker

const MINIMAX_API_URL = 'https://api.minimaxi.com/anthropic/v1/messages';
const STORAGE_KEY = 'duck_translate_settings';

const DEFAULT_SETTINGS = {
  apiKey: '',
  sourceLang: 'auto',
  targetLang: 'zh-CN',
  popupPosition: 'bottom',
  showPinyin: true,
  enableTTS: true,
  ttsModel: 'speech-2.8-hd',
  ttsVoiceId: 'male-qn-qingse',
  ttsSpeed: 1.0,
  ttsVolume: 1.0,
  ttsPitch: 0,
  ttsEmotion: 'neutral',
  ttsFormat: 'mp3',
  ttsSampleRate: 32000
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

const TTS_MODELS = [
  { value: 'speech-2.8-hd', label: 'Speech 2.8 HD (Best Quality)' },
  { value: 'speech-2.8-turbo', label: 'Speech 2.8 Turbo (Fast)' },
  { value: 'speech-2.6-hd', label: 'Speech 2.6 HD' },
  { value: 'speech-2.6-turbo', label: 'Speech 2.6 Turbo' },
  { value: 'speech-02-hd', label: 'Speech 02 HD' },
  { value: 'speech-02-turbo', label: 'Speech 02 Turbo' },
  { value: 'speech-01-hd', label: 'Speech 01 HD' },
  { value: 'speech-01-turbo', label: 'Speech 01 Turbo' }
];

const TTS_EMOTIONS = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'sad', label: 'Sad' },
  { value: 'angry', label: 'Angry' },
  { value: 'calm', label: 'Calm' },
  { value: 'excited', label: 'Excited' }
];

const TTS_FORMATS = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'flac', label: 'FLAC' }
];

const TTS_VOICES = [
  { value: 'male-qn-qingse', label: 'Male QN Qingshe' },
  { value: 'female-qn-qingse', label: 'Female QN Qingshe' },
  { value: 'male-qn-qingse', label: 'Male QN Qingshe (Default)' },
  { value: 'female-qn-shaonv', label: 'Female QN Shaonv' },
  { value: 'male-qn-qingchun', label: 'Male QN Qingchun' },
  { value: 'female-qn-qingchun', label: 'Female QN Qingchun' },
  { value: 'male-qn-chenshou', label: 'Male QN Chenshou' },
  { value: 'female-qn-chenshou', label: 'Female QN Chenshou' }
];

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

  const isChineseTarget = targetLang === 'zh-CN' || targetLang === 'zh-TW';
  const systemPrompt = `You are a professional translator.

Translate from ${sourceLang === 'auto' ? 'the detected source language' : LANGUAGES[sourceLang]?.name || sourceLang} to ${LANGUAGES[targetLang]?.name || targetLang}.
${isChineseTarget ? 'For Chinese translation, provide pinyin (romanization) and pronunciation.' : 'For English, provide phonetic transcription (IPA).'}
Maintain the original tone, style, and nuance. Keep formatting.

Format your response EXACTLY as:
${isChineseTarget ? `【翻译】
[translation]

【拼音】
[pinyin in spaces, e.g. ni hao]

【发音】
[pronunciation without spaces]` : `【翻译】
[translation]

【音标】
[IPA phonetic transcription, e.g. /həˈloʊ/]

【发音】
[pronounced as]`}

Output ONLY the translation in this format, no other text.`;

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

const TTS_API_URL = 'https://api.minimaxi.com/v1/t2a_v2';

const LANGUAGE_BOOST_MAP = {
  'zh-CN': 'Chinese',
  'zh-TW': 'Yue',
  'en': 'English',
  'ja': 'Japanese',
  'ko': 'Korean',
  'fr': 'French',
  'de': 'German',
  'es': 'Spanish',
  'ru': 'Russian',
  'ar': 'Arabic',
  'pt': 'Portuguese',
  'it': 'Italian',
  'th': 'Thai',
  'vi': 'Vietnamese',
  'id': 'Indonesian',
  'ms': 'Malay'
};

// Convert hex string to array buffer
function hexToBuffer(hex) {
  const buffer = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < hex.length; i += 2) {
    view[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return buffer;
}

// Deep log object to see all properties
function deepLog(obj) {
  console.log('Duck Translate: Deep response log');
  console.log('Duck Translate: Response keys', Object.keys(obj));
  
  // Log data structure
  if (obj.data) {
    console.log('Duck Translate: data object', obj.data);
    console.log('Duck Translate: data keys', Object.keys(obj.data));
  }
  
  // Try to find any audio-related fields
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase().includes('audio') || key.toLowerCase().includes('data')) {
      console.log('Duck Translate: Found key ' + key + '=', obj[key]);
    }
  }
  
  // Log entire object as JSON
  try {
    console.log('Duck Translate: Full JSON response', JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Duck Translate: Cannot stringify response', e);
  }
}

async function generateTTS(text, targetLang, apiKey, settings) {
  if (!apiKey || !text) return { success: false, error: 'API key or text is missing' };

  try {
    console.log('Duck Translate: TTS request', {
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      targetLang: targetLang,
      model: settings.ttsModel || 'speech-2.8-hd',
      voiceId: settings.ttsVoiceId || 'male-qn-qingse'
    });

    const response = await fetch(TTS_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.ttsModel || 'speech-2.8-hd',
        text: text,
        stream: false,
        voice_setting: {
          voice_id: settings.ttsVoiceId || 'male-qn-qingse',
          speed: settings.ttsSpeed || 1.0,
          vol: settings.ttsVolume || 1.0,
          pitch: settings.ttsPitch || 0,
          emotion: settings.ttsEmotion || 'neutral'
        },
        audio_setting: {
          sample_rate: settings.ttsSampleRate || 32000,
          bitrate: 128000,
          format: settings.ttsFormat || 'mp3',
          channel: 1
        },
        language_boost: LANGUAGE_BOOST_MAP[targetLang] || 'auto',
        subtitle_enable: false,
        aigc_watermark: false
      })
    });

    console.log('Duck Translate: TTS response status', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Duck Translate: TTS API error', errorData);
      return { success: false, error: errorData.error?.message || `TTS API request failed: ${response.status}` };
    }

    const responseData = await response.json();
    deepLog(responseData);
    
    // Check base_resp for errors
    if (responseData.base_resp && responseData.base_resp.status_code !== 0) {
      console.error('Duck Translate: TTS base_resp error', responseData.base_resp);
      return { success: false, error: responseData.base_resp.status_msg || 'TTS API error' };
    }
    
    // Try multiple ways to extract audio data
    let audioData = null;
    
    // Check various possible locations
    if (responseData.data && responseData.data.audio) {
      audioData = responseData.data.audio;
      console.log('Duck Translate: Found audio in data.audio');
    } else if (responseData.audio) {
      audioData = responseData.audio;
      console.log('Duck Translate: Found audio in audio');
    } else if (responseData.data && responseData.data.data) {
      audioData = responseData.data.data;
      console.log('Duck Translate: Found audio in data.data');
    } else if (responseData.data && typeof responseData.data === 'string' && responseData.data.length > 100) {
      // Maybe data itself is the audio string?
      audioData = responseData.data;
      console.log('Duck Translate: Using data field as audio');
    } else if (responseData.extra_info && responseData.extra_info.audio) {
      audioData = responseData.extra_info.audio;
      console.log('Duck Translate: Found audio in extra_info.audio');
    } else {
      // Try to find any field that looks like hex audio
      for (const key of Object.keys(responseData)) {
        const value = responseData[key];
        if (typeof value === 'string' && value.length > 100) {
          console.log('Duck Translate: Found long string in ' + key + ', trying as audio');
          audioData = value;
          break;
        }
        if (typeof value === 'object' && value !== null) {
          for (const subKey of Object.keys(value)) {
            const subValue = value[subKey];
            if (typeof subValue === 'string' && subValue.length > 100) {
              console.log('Duck Translate: Found long string in ' + key + '.' + subKey + ', trying as audio');
              audioData = subValue;
              break;
            }
          }
          if (audioData) break;
        }
      }
    }

    if (!audioData) {
      console.error('Duck Translate: No audio data found in response');
      return { success: false, error: 'Invalid TTS response: missing audio data' };
    }

    console.log('Duck Translate: Audio data length', audioData.length);

    // Convert hex to array buffer
    const buffer = hexToBuffer(audioData);
    
    // Convert to base64 for easier transfer
    const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
    const audioType = settings.ttsFormat || 'mp3';
    const dataUrl = `data:audio/${audioType};base64,${base64}`;
    
    console.log('Duck Translate: TTS generated successfully');
    return { success: true, audioDataUrl: dataUrl };
  } catch (e) {
    console.error('Duck Translate: TTS generation error', e);
    return { success: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslate(request, sender, sendResponse);
    return true;
  }
  if (request.action === 'generateTTS') {
    handleGenerateTTS(request, sender, sendResponse);
    return true;
  }
  if (request.action === 'getLanguages') {
    sendResponse({ languages: LANGUAGES });
    return true;
  }
  if (request.action === 'getTTSSettings') {
    sendResponse({
      models: TTS_MODELS,
      emotions: TTS_EMOTIONS,
      formats: TTS_FORMATS,
      voices: TTS_VOICES
    });
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

async function handleGenerateTTS(request, sender, sendResponse) {
  try {
    const settings = await getSettings();
    const { text, targetLang } = request;

    const result = await generateTTS(
      text,
      targetLang || settings.targetLang,
      settings.apiKey,
      settings
    );

    sendResponse(result);
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

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

    // Generate TTS audio for the translation (only if enableTTS is enabled)
    let audioDataUrl = null;
    let ttsError = null;
    if (settings.enableTTS && settings.apiKey) {
      // Extract just the translation text from the AI response
      const parsed = parseTranslationResult(result);
      const translationText = parsed.translation;
      if (translationText) {
        const actualTargetLang = targetLang || settings.targetLang;
        const ttsResult = await generateTTS(translationText, actualTargetLang, settings.apiKey, settings);
        if (ttsResult.success) {
          audioDataUrl = ttsResult.audioDataUrl;
        } else {
          ttsError = ttsResult.error;
          console.warn('Duck Translate: TTS generation failed:', ttsError);
        }
      }
    }

    sendResponse({ success: true, result, audioDataUrl, ttsError });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

function parseTranslationResult(result) {
  const parsed = { translation: '', phonetic: '' };
  if (!result) return parsed;

  // Try to parse structured format
  const transMatch = result.match(/【翻译】\s*([\s\S]*?)(?=【拼音】|【音标】|$)/i);
  const pinyinMatch = result.match(/【拼音】\s*([\s\S]*?)(?=【发音】|【翻译】|$)/i);
  const ipaMatch = result.match(/【音标】\s*([\s\S]*?)(?=【发音】|【翻译】|$)/i);

  if (transMatch) {
    parsed.translation = transMatch[1].trim();
  }
  if (pinyinMatch) {
    parsed.phonetic = '拼音: ' + pinyinMatch[1].trim();
  } else if (ipaMatch) {
    parsed.phonetic = '音标: ' + ipaMatch[1].trim();
  }

  if (!parsed.translation) {
    parsed.translation = result;
  }

  return parsed;
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
