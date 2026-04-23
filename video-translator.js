// Duck Translate - YouTube Subtitle Translator (Simplified)

(function() {
  'use strict';

  const BUTTON_ID = 'duck-translate-yt-btn';
  const PANEL_ID = 'duck-translate-yt-panel';

  // 检测是否是 YouTube 页面
  function isYouTube() {
    return window.location.hostname.includes('youtube.com');
  }

  // 创建翻译按钮
  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.innerHTML = '🦆';
    btn.title = 'Translate YouTube Subtitles';

    Object.assign(btn.style, {
      position: 'fixed',
      zIndex: '9999999',
      background: 'linear-gradient(135deg, #FF9A56 0%, #FFBD59 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '50%',
      width: '40px',
      height: '40px',
      fontSize: '20px',
      cursor: 'pointer',
      boxShadow: '0 4px 16px rgba(255, 150, 80, 0.5)',
      fontFamily: 'sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform 0.2s, box-shadow 0.2s'
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 6px 20px rgba(255, 150, 80, 0.6)';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 16px rgba(255, 150, 80, 0.5)';
    });

    document.body.appendChild(btn);
    positionButton(btn);

    window.addEventListener('resize', () => positionButton(btn));
  }

  // 定位按钮
  function positionButton(btn) {
    btn.style.top = '20px';
    btn.style.right = '20px';
  }

  // 显示/隐藏面板
  function togglePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.remove();
      return;
    }
    showPanel();
  }

  // 显示翻译面板
  function showPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    const video = document.querySelector('video');
    const rect = video ? video.getBoundingClientRect() : { right: window.innerWidth - 20, top: 80, width: 400 };

    panel.style.cssText = `
      position: fixed;
      z-index: 9999998;
      background: #FFFDFB;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(180, 120, 60, 0.25);
      width: 380px;
      max-height: 500px;
      overflow: hidden;
      font-family: 'Segoe UI', -apple-system, sans-serif;
      animation: duck-slide-in 0.3s ease;
    `;

    panel.innerHTML = `
      <style>
        @keyframes duck-slide-in {
          from { opacity: 0; transform: translateY(-10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        #${PANEL_ID} .duck-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          background: linear-gradient(135deg, #FF9A56 0%, #FFBD59 100%);
        }
        #${PANEL_ID} .duck-header-title {
          font-weight: 700;
          font-size: 15px;
          color: white;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #${PANEL_ID} .duck-close {
          background: rgba(255,255,255,0.3);
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          font-size: 18px;
          color: white;
          cursor: pointer;
          transition: background 0.2s;
        }
        #${PANEL_ID} .duck-close:hover {
          background: rgba(255,255,255,0.5);
        }
        #${PANEL_ID} .duck-content {
          padding: 16px;
          max-height: 400px;
          overflow-y: auto;
        }
        #${PANEL_ID} .duck-status {
          text-align: center;
          padding: 20px;
          color: #8B7B6B;
          font-size: 14px;
        }
        #${PANEL_ID} .duck-subtitle-item {
          background: #FFFBF5;
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 10px;
          border-left: 3px solid #FFBD59;
        }
        #${PANEL_ID} .duck-subtitle-time {
          font-size: 11px;
          color: #B89F8A;
          margin-bottom: 6px;
        }
        #${PANEL_ID} .duck-subtitle-original {
          color: #666;
          font-size: 13px;
          margin-bottom: 6px;
        }
        #${PANEL_ID} .duck-subtitle-translated {
          color: #4a3f35;
          font-size: 14px;
          font-weight: 500;
          padding-top: 8px;
          border-top: 1px dashed #F0E4D7;
        }
        #${PANEL_ID} .duck-btn {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        #${PANEL_ID} .duck-btn-primary {
          background: linear-gradient(135deg, #FF9A56 0%, #FFBD59 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(255, 150, 80, 0.4);
        }
        #${PANEL_ID} .duck-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(255, 150, 80, 0.5);
        }
        #${PANEL_ID} .duck-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
      </style>
      <div class="duck-header">
        <span class="duck-header-title">🦆 YouTube 字幕翻译</span>
        <button class="duck-close" onclick="this.closest('#${PANEL_ID}').remove()">×</button>
      </div>
      <div class="duck-content">
        <div class="duck-status" id="duck-status">点击下方按钮加载字幕...</div>
        <div id="duck-subtitles"></div>
        <button class="duck-btn duck-btn-primary" id="duck-translate-btn" disabled>✨ 翻译字幕</button>
      </div>
    `;

    panel.style.left = `${Math.max(20, rect.right - 400)}px`;
    panel.style.top = `${rect.top + 60}px`;

    document.body.appendChild(panel);

    initSubtitleLoading(panel);
  }

  // 初始化字幕加载
  function initSubtitleLoading(panel) {
    const statusEl = panel.querySelector('#duck-status');
    const subtitlesEl = panel.querySelector('#duck-subtitles');
    const translateBtn = panel.querySelector('#duck-translate-btn');

    const video = document.querySelector('video');
    if (!video) {
      statusEl.textContent = '未找到视频';
      return;
    }

    // 方式1: 通过 YouTube Player API
    const ytPlayer = document.querySelector('#movie_player');

    if (ytPlayer && typeof ytPlayer.getPlayerResponse === 'function') {
      try {
        const playerResponse = ytPlayer.getPlayerResponse();
        console.log('Duck Translate: PlayerResponse:', playerResponse);

        if (playerResponse && playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          const trackList = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;

          if (trackList && trackList.length > 0) {
            statusEl.textContent = `找到 ${trackList.length} 个字幕轨道`;

            const tracks = trackList.map(track => ({
              languageCode: track.languageCode,
              languageName: track.languageName?.simpleText || track.languageCode,
              baseUrl: track.baseUrl
            }));

            displaySubtitleTracks(tracks, subtitlesEl, translateBtn, video);
            return;
          }
        }
      } catch (e) {
        console.log('Duck Translate: Error via PlayerResponse', e);
      }
    }

    // 方式2: 通过 video.textTracks
    try {
      const textTracks = Array.from(video.textTracks || []);
      console.log('Duck Translate: video.textTracks:', textTracks);

      if (textTracks.length > 0) {
        const activeTracks = textTracks.filter(t => t.kind === 'subtitles' || t.kind === 'captions');
        if (activeTracks.length > 0) {
          statusEl.textContent = `找到 ${activeTracks.length} 个字幕轨道 (via textTracks)`;
          // textTracks API 不提供 baseUrl，需要其他方式
        }
      }
    } catch (e) {
      console.log('Duck Translate: Error via textTracks', e);
    }

    // 方式3: 通过页面上的字幕按钮状态
    const captionBtn = document.querySelector('.ytp-subtitles-button') || document.querySelector('[aria-label*="subtitles"]');
    if (captionBtn) {
      statusEl.innerHTML = '字幕未开启，请先点击字幕按钮开启字幕<br><small style="color:#B89F8A">然后刷新页面重新点击 🦆 按钮</small>';
    } else {
      statusEl.textContent = '该视频没有字幕或无法获取';
    }
  }

  // 显示字幕轨道列表
  function displaySubtitleTracks(tracks, container, translateBtn, video) {
    container.innerHTML = tracks.map((track, i) => `
      <div class="duck-subtitle-item" data-index="${i}" style="cursor: pointer;">
        <div class="duck-subtitle-time">${track.languageName}</div>
      </div>
    `).join('');

    container.querySelectorAll('.duck-subtitle-item').forEach((item, i) => {
      item.addEventListener('click', () => {
        loadSubtitles(tracks[i], video);
        translateBtn.disabled = false;
        translateBtn.dataset.trackIndex = i;
        container.querySelectorAll('.duck-subtitle-item').forEach(el => el.style.borderLeftColor = '#FFBD59');
        item.style.borderLeftColor = '#FF9A56';
      });
    });

    translateBtn.addEventListener('click', () => {
      const trackIndex = translateBtn.dataset.trackIndex;
      if (trackIndex !== undefined && tracks[trackIndex]) {
        loadSubtitles(tracks[trackIndex], video);
        translateBtn.disabled = true;
        translateBtn.textContent = '🦆 翻译中...';
      }
    });
  }

  // 加载字幕
  async function loadSubtitles(track, video) {
    const subtitlesEl = document.querySelector('#duck-subtitles');
    const translateBtn = document.querySelector('#duck-translate-btn');
    const statusEl = document.querySelector('#duck-status');

    if (!subtitlesEl) return;

    try {
      statusEl.textContent = '正在加载字幕...';

      const response = await fetch(track.baseUrl);
      let vttContent = await response.text();

      // 解析 VTT 格式
      const subtitles = parseVTT(vttContent);

      if (subtitles.length === 0) {
        statusEl.textContent = '字幕内容为空';
        return;
      }

      statusEl.textContent = `加载了 ${subtitles.length} 条字幕`;

      // 显示字幕
      displaySubtitles(subtitles, subtitlesEl);

      // 翻译按钮点击
      translateBtn.textContent = '✨ 翻译字幕';
      translateBtn.disabled = false;
      translateBtn.onclick = () => translateSubtitles(subtitles, subtitlesEl, translateBtn);

    } catch (error) {
      statusEl.textContent = `加载失败: ${error.message}`;
    }
  }

  // 解析 VTT 格式字幕
  function parseVTT(vttContent) {
    const subtitles = [];
    const lines = vttContent.split('\n');
    let currentSub = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 时间行格式: 00:00:00.000 --> 00:00:05.000
      if (trimmed.includes('-->')) {
        const [start, end] = trimmed.split('-->').map(t => t.trim());
        currentSub = {
          startTime: parseVTTTime(start),
          endTime: parseVTTTime(end),
          text: ''
        };
      } else if (currentSub && trimmed) {
        // 字幕文本
        if (currentSub.text) {
          currentSub.text += '\n' + trimmed;
        } else {
          currentSub.text = trimmed;
        }
      } else if (!trimmed && currentSub && currentSub.text) {
        // 空行表示一个字幕块结束
        subtitles.push(currentSub);
        currentSub = null;
      }
    }

    // 最后一个字幕
    if (currentSub && currentSub.text) {
      subtitles.push(currentSub);
    }

    return subtitles;
  }

  // 解析 VTT 时间格式
  function parseVTTTime(timeStr) {
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      const [h, m, s] = parts;
      return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s);
    } else if (parts.length === 2) {
      const [m, s] = parts;
      return parseFloat(m) * 60 + parseFloat(s);
    }
    return 0;
  }

  // 显示字幕列表
  function displaySubtitles(subtitles, container) {
    container.innerHTML = subtitles.slice(0, 50).map((sub, i) => `
      <div class="duck-subtitle-item" data-index="${i}">
        <div class="duck-subtitle-time">${formatTime(sub.startTime)} → ${formatTime(sub.endTime)}</div>
        <div class="duck-subtitle-original">${escapeHtml(sub.text)}</div>
        <div class="duck-subtitle-translated" id="translated-${i}" style="display: none;"></div>
      </div>
    `).join('');

    if (subtitles.length > 50) {
      container.innerHTML += `<div style="text-align: center; color: #B89F8A; padding: 10px;">还有 ${subtitles.length - 50} 条字幕未显示</div>`;
    }
  }

  // 翻译字幕
  async function translateSubtitles(subtitles, container, btn) {
    btn.disabled = true;
    btn.textContent = '🦆 翻译中...';

    const settings = await loadSettings();
    const sourceLang = settings.sourceLang || 'auto';
    const targetLang = settings.targetLang || 'zh-CN';

    for (let i = 0; i < subtitles.length; i++) {
      const sub = subtitles[i];
      const translatedEl = document.getElementById(`translated-${i}`);

      if (!translatedEl || translatedEl.textContent) continue;

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'translate',
          text: sub.text,
          sourceLang: sourceLang,
          targetLang: targetLang
        });

        if (response && response.success) {
          translatedEl.textContent = response.result;
          translatedEl.style.display = 'block';
        } else {
          translatedEl.textContent = `错误: ${response?.error || '翻译失败'}`;
          translatedEl.style.display = 'block';
        }
      } catch (error) {
        translatedEl.textContent = `错误: ${error.message}`;
        translatedEl.style.display = 'block';
      }

      // 延迟避免 API 限制
      await new Promise(r => setTimeout(r, 300));
    }

    btn.textContent = '✨ 翻译完成';
    btn.disabled = false;
  }

  // 获取设置
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        resolve(response?.settings || { sourceLang: 'auto', targetLang: 'zh-CN' });
      });
    });
  }

  // 格式化时间
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // HTML 转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 初始化
  function init() {
    if (!isYouTube()) return;

    // 等待 YouTube Player 加载
    const checkPlayer = setInterval(() => {
      const player = document.querySelector('#movie_player');
      if (player && player.getPlayerResponse) {
        clearInterval(checkPlayer);
        createButton();
      }
    }, 1000);

    // 超时停止检查
    setTimeout(() => clearInterval(checkPlayer), 30000);
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
