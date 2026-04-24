// Duck Translate - Options Page Script

// DOM Elements
const elements = {
  apiKey: document.getElementById('apiKey'),
  sourceLang: document.getElementById('sourceLang'),
  targetLang: document.getElementById('targetLang'),
  showPinyin: document.getElementById('showPinyin'),
  enableTTS: document.getElementById('enableTTS'),
  ttsModel: document.getElementById('ttsModel'),
  ttsVoice: document.getElementById('ttsVoice'),
  ttsEmotion: document.getElementById('ttsEmotion'),
  ttsFormat: document.getElementById('ttsFormat'),
  ttsSpeed: document.getElementById('ttsSpeed'),
  ttsVolume: document.getElementById('ttsVolume'),
  ttsPitch: document.getElementById('ttsPitch'),
  ttsSpeedValue: document.getElementById('ttsSpeedValue'),
  ttsVolumeValue: document.getElementById('ttsVolumeValue'),
  ttsPitchValue: document.getElementById('ttsPitchValue'),
  saveBtn: document.getElementById('saveBtn'),
  statusMessage: document.getElementById('statusMessage')
};

// Load TTS settings data
function loadTTSSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getTTSSettings' }, (response) => {
      resolve(response);
    });
  });
}

// Load settings from storage
function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      resolve(response?.settings || {});
    });
  });
}

// Save settings to storage
function saveSettings(settings) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'saveSettings', settings }, (response) => {
      if (response?.success) {
        resolve();
      } else {
        reject(new Error(response?.error || 'Failed to save settings'));
      }
    });
  });
}

// Populate select options
function populateSelect(selectElement, options, selectedValue) {
  if (!selectElement) return;
  
  selectElement.innerHTML = '';
  options.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    if (option.value === selectedValue) {
      optionElement.selected = true;
    }
    selectElement.appendChild(optionElement);
  });
}

// Update range value display
function setupRangeListeners() {
  elements.ttsSpeed.addEventListener('input', (e) => {
    elements.ttsSpeedValue.textContent = e.target.value;
  });
  
  elements.ttsVolume.addEventListener('input', (e) => {
    elements.ttsVolumeValue.textContent = e.target.value;
  });
  
  elements.ttsPitch.addEventListener('input', (e) => {
    elements.ttsPitchValue.textContent = e.target.value;
  });
}

// Show status message
function showStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${isError ? 'error' : 'success'} show`;
  
  setTimeout(() => {
    elements.statusMessage.classList.remove('show');
  }, 3000);
}

// Initialize page
async function init() {
  try {
    // Load TTS settings data
    const ttsSettings = await loadTTSSettings();
    
    // Load current settings
    const settings = await loadSettings();
    
    // Populate form fields
    elements.apiKey.value = settings.apiKey || '';
    elements.sourceLang.value = settings.sourceLang || 'auto';
    elements.targetLang.value = settings.targetLang || 'zh-CN';
    elements.showPinyin.checked = settings.showPinyin !== false;
    elements.enableTTS.checked = settings.enableTTS !== false;
    
    // Populate TTS settings
    populateSelect(elements.ttsModel, ttsSettings.models || [], settings.ttsModel || 'speech-2.8-hd');
    populateSelect(elements.ttsVoice, ttsSettings.voices || [], settings.ttsVoiceId || 'male-qn-qingse');
    populateSelect(elements.ttsEmotion, ttsSettings.emotions || [], settings.ttsEmotion || 'neutral');
    populateSelect(elements.ttsFormat, ttsSettings.formats || [], settings.ttsFormat || 'mp3');
    
    elements.ttsSpeed.value = settings.ttsSpeed || 1.0;
    elements.ttsVolume.value = settings.ttsVolume || 1.0;
    elements.ttsPitch.value = settings.ttsPitch || 0;
    
    elements.ttsSpeedValue.textContent = elements.ttsSpeed.value;
    elements.ttsVolumeValue.textContent = elements.ttsVolume.value;
    elements.ttsPitchValue.textContent = elements.ttsPitch.value;
    
    // Setup range listeners
    setupRangeListeners();
    
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Save button click handler
async function handleSave() {
  try {
    const settings = {
      apiKey: elements.apiKey.value,
      sourceLang: elements.sourceLang.value,
      targetLang: elements.targetLang.value,
      showPinyin: elements.showPinyin.checked,
      enableTTS: elements.enableTTS.checked,
      ttsModel: elements.ttsModel.value,
      ttsVoiceId: elements.ttsVoice.value,
      ttsEmotion: elements.ttsEmotion.value,
      ttsFormat: elements.ttsFormat.value,
      ttsSpeed: parseFloat(elements.ttsSpeed.value),
      ttsVolume: parseFloat(elements.ttsVolume.value),
      ttsPitch: parseFloat(elements.ttsPitch.value)
    };
    
    await saveSettings(settings);
    showStatus('Settings saved successfully!');
    
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, true);
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', init);
elements.saveBtn.addEventListener('click', handleSave);
