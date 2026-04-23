// Duck Translate - Content Script

(function() {
  'use strict';

  let currentPopup = null;
  let cachedSettings = null;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let currentAudio = null;

  // TTS (Text-to-Speech) using MiniMax API
  const TTS_WS_URL = 'wss://api.minimaxi.com/ws/v1/t2a_v2';

  async function playTTS(text, targetLang) {
    try {
      var settings = await loadSettings();
      var apiKey = settings.apiKey;
      if (!apiKey) {
        console.log('Duck Translate: No API key for TTS');
        return;
      }

      // Map language codes to MiniMax voice IDs
      var voiceMap = {
        'zh-CN': 'Chinese (Mandarin)',
        'zh-TW': 'Chinese (Cantonese)',
        'en': 'English (US)',
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

      var voiceId = voiceMap[targetLang] || 'English (US)';

      return new Promise(function(resolve, reject) {
        var ws = new WebSocket(TTS_WS_URL);

        ws.onopen = function() {
          // Send task_start message
          ws.send(JSON.stringify({
            task_start: {
              token: apiKey,
              model: 'speech-2.8-hd',
              voice_setting: {
                voice_id: voiceId,
                speed: 1.0,
                pitch: 0,
                volume: 1.0
              },
              audio_setting: {
                sample_rate: 32000,
                bitrate: 128000,
                format: 'mp3'
              }
            }
          }));
        };

        ws.onmessage = function(event) {
          var data = JSON.parse(event.data);
          if (data.data && data.data.audio) {
            // Convert hex to audio
            var audioHex = data.data.audio;
            var audioBytes = new Uint8Array(audioHex.length / 2);
            for (var i = 0; i < audioBytes.length; i++) {
              audioBytes[i] = parseInt(audioHex.substr(i * 2, 2), 16);
            }

            // Stop previous audio
            if (currentAudio) {
              currentAudio.pause();
              currentAudio = null;
            }

            // Play audio
            var blob = new Blob([audioBytes], { type: 'audio/mp3' });
            var url = URL.createObjectURL(blob);
            currentAudio = new Audio(url);
            currentAudio.play();
            ws.close();
            resolve();
          } else if (data.error) {
            ws.close();
            reject(new Error(data.error));
          }
        };

        ws.onerror = function(e) {
          reject(e);
        };

        ws.onclose = function() {
          // Send text in chunks
          setTimeout(function() {
            var chunkSize = 200;
            var chunks = text.length <= chunkSize ? [text] : text.match(new RegExp('[\\s\\S]{1,' + chunkSize + '}', 'g'));
            var sendChunk = function(index) {
              if (index >= chunks.length) {
                return;
              }
              ws.send(JSON.stringify({
                task_continue: {
                  text: chunks[index]
                }
              }));
              setTimeout(function() { sendChunk(index + 1); }, 100);
            };
            sendChunk(0);
          }, 500);
        };
      });
    } catch (e) {
      console.error('Duck Translate: TTS error', e);
    }
  }

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

  function showTranslation(text, result, error, targetLang) {
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

    // Detect if result is Chinese (contains Chinese characters)
    var isChinese = /[一-龥]/.test(result);
    var pinyinHtml = '';

    if (isChinese) {
      // Simple pinyin conversion (basic, for demonstration)
      pinyinHtml = '<div class="duck-popup-pinyin" id="duck-pinyin">加载拼音...</div>';
    }

    content.innerHTML = '<div class="duck-popup-source">' + sourceText + '</div>' +
      '<div class="duck-popup-text">' + result + '</div>' +
      pinyinHtml +
      '<div class="duck-popup-actions">' +
      '<button class="duck-popup-btn" data-action="tts">🔊 朗读</button>' +
      '<button class="duck-popup-btn" data-action="copy">Copy</button>' +
      '<button class="duck-popup-btn primary" data-action="swap">Swap & Translate</button>' +
      '</div>';

    // TTS button handler
    content.querySelector('[data-action="tts"]').addEventListener('click', function() {
      var btn = this;
      btn.textContent = '🔊 播放中...';
      btn.disabled = true;
      playTTS(result, targetLang || 'zh-CN').finally(function() {
        btn.textContent = '🔊 朗读';
        btn.disabled = false;
      });
    });

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

    // Generate pinyin if Chinese
    if (isChinese) {
      generatePinyin(result);
    }
  }

  // Simple pinyin generation for Chinese text
  var pinyinMap = {
    '啊': 'a', '阿': 'a', '爱': 'ai', '安': 'an', '暗': 'an',
    '八': 'ba', '把': 'ba', '吧': 'ba', '白': 'bai', '百': 'bai', '班': 'ban', '半': 'ban', '办': 'ban', '帮': 'bang', '包': 'bao', '保': 'bao', '报': 'bao', '北': 'bei', '被': 'bei', '本': 'ben', '比': 'bi', '笔': 'bi', '边': 'bian', '变': 'bian', '别': 'bie', '病': 'bing', '不': 'bu', '步': 'bu', '部': 'bu', '擦': 'ca', '猜': 'cai', '才': 'cai', '菜': 'cai', '参': 'can', '草': 'cao', '层': 'ceng', '茶': 'cha', '查': 'cha', '产': 'chan', '长': 'chang', '场': 'chang', '唱': 'chang', '超': 'chao', '车': 'che', '陈': 'chen', '城': 'cheng', '成': 'cheng', '吃': 'chi', '持': 'chi', '出': 'chu', '除': 'chu', '楚': 'chu', '处': 'chu', '穿': 'chuan', '船': 'chuan', '窗': 'chuang', '床': 'chuang', '春': 'chun', '词': 'ci', '次': 'ci', '从': 'cong', '村': 'cun', '错': 'cuo', '打': 'da', '大': 'da', '带': 'dai', '代': 'dai', '单': 'dan', '但': 'dan', '蛋': 'dan', '道': 'dao', '到': 'dao', '导': 'dao', '得': 'de', '灯': 'deng', '等': 'deng', '低': 'di', '底': 'di', '点': 'dian', '店': 'dian', '电': 'dian', '店': 'dian', '调': 'diao', '掉': 'diao', '爹': 'die', '顶': 'ding', '定': 'ding', '丢': 'diu', '东': 'dong', '冬': 'dong', '懂': 'dong', '动': 'dong', '都': 'dou', '读': 'du', '短': 'duan', '段': 'duan', '断': 'duan', '对': 'dui', '多': 'duo', '夺': 'duo', '饿': 'e', '二': 'er', '发': 'fa', '法': 'fa', '反': 'fan', '饭': 'fan', '方': 'fang', '房': 'fang', '放': 'fang', '飞': 'fei', '非': 'fei', '费': 'fei', '分': 'fen', '份': 'fen', '风': 'feng', '服': 'fu', '福': 'fu', '父': 'fu', '付': 'fu', '复': 'fu', '该': 'gai', '改': 'gai', '干': 'gan', '感': 'gan', '刚': 'gang', '高': 'gao', '告': 'gao', '哥': 'ge', '歌': 'ge', '个': 'ge', '给': 'gei', '跟': 'gen', '根': 'gen', '工': 'gong', '公': 'gong', '共': 'gong', '狗': 'gou', '够': 'gou', '古': 'gu', '故': 'gu', '瓜': 'gua', '挂': 'gua', '关': 'guan', '管': 'guan', '光': 'guang', '广': 'guang', '贵': 'gui', '国': 'guo', '果': 'guo', '过': 'guo', '还': 'hai', '孩': 'hai', '海': 'hai', '害': 'hai', '汉': 'han', '号': 'hao', '好': 'hao', '喝': 'he', '河': 'he', '黑': 'hei', '很': 'hen', '红': 'hong', '后': 'hou', '候': 'hou', '呼': 'hu', '湖': 'hu', '虎': 'hu', '护': 'hu', '花': 'hua', '化': 'hua', '话': 'hua', '坏': 'huai', '换': 'huan', '黄': 'huang', '回': 'hui', '会': 'hui', '汇': 'hui', '活': 'huo', '火': 'huo', '或': 'huo', '机': 'ji', '鸡': 'ji', '级': 'ji', '极': 'ji', '几': 'ji', '己': 'ji', '记': 'ji', '季': 'ji', '继': 'ji', '济': 'ji', '家': 'jia', '加': 'jia', '价': 'jia', '架': 'jia', '假': 'jia', '嫁': 'jia', '件': 'jian', '建': 'jian', '见': 'jian', '键': 'jian', '江': 'jiang', '讲': 'jiang', '奖': 'jiang', '交': 'jiao', '脚': 'jiao', '角': 'jiao', '教': 'jiao', '叫': 'jiao', '接': 'jie', '街': 'jie', '节': 'jie', '姐': 'jie', '解': 'jie', '今': 'jin', '金': 'jin', '仅': 'jin', '尽': 'jin', '进': 'jin', '近': 'jin', '劲': 'jin', '京': 'jing', '经': 'jing', '精': 'jing', '井': 'jing', '静': 'jing', '九': 'jiu', '酒': 'jiu', '久': 'jiu', '旧': 'jiu', '就': 'jiu', '举': 'ju', '句': 'ju', '剧': 'ju', '据': 'ju', '聚': 'ju', '开': 'kai', '看': 'kan', '考': 'kao', '靠': 'kao', '科': 'ke', '可': 'ke', '课': 'ke', '刻': 'ke', '客': 'ke', '课': 'ke', '空': 'kong', '口': 'kou', '哭': 'ku', '苦': 'ku', '快': 'kuai', '块': 'kuai', '会': 'kuai', '宽': 'kuan', '况': 'kuang', '筐': 'kuang', '亏': 'kui', '困': 'kun', '拉': 'la', '落': 'la', '来': 'lai', '菜': 'lai', '蓝': 'lan', '男': 'nan', '难': 'nan', '南': 'nan', '呢': 'ne', '内': 'nei', '能': 'neng', '你': 'ni', '年': 'nian', '念': 'nian', '鸟': 'niao', '您': 'nin', '牛': 'niu', '农': 'nong', '弄': 'nong', '奴': 'nu', '女': 'nv', '暖': 'nuan', '怕': 'pa', '拍': 'pai', '排': 'pai', '派': 'pai', '盘': 'pan', '旁': 'pang', '跑': 'pao', '朋': 'peng', '皮': 'pi', '片': 'pian', '偏': 'pian', '票': 'piao', '漂': 'piao', '品': 'pin', '平': 'ping', '苹': 'ping', '凭': 'ping', '七': 'qi', '期': 'qi', '其': 'qi', '奇': 'qi', '骑': 'qi', '起': 'qi', '气': 'qi', '汽': 'qi', '器': 'qi', '恰': 'qia', '千': 'qian', '前': 'qian', '钱': 'qian', '浅': 'qian', '强': 'qiang', '墙': 'qiang', '桥': 'qiao', '巧': 'qiao', '青': 'qing', '轻': 'qing', '清': 'qing', '晴': 'qing', '情': 'qing', '请': 'qing', '秋': 'qiu', '球': 'qiu', '求': 'qiu', '区': 'qu', '去': 'qu', '趣': 'qu', '全': 'quan', '却': 'que', '群': 'qun', '然': 'ran', '让': 'rang', '绕': 'rao', '热': 're', '人': 'ren', '认': 'ren', '日': 'ri', '容': 'rong', '肉': 'rou', '如': 'ru', '入': 'ru', '软': 'ruan', '若': 'ruo', '三': 'san', '散': 'san', '桑': 'sang', '扫': 'sao', '色': 'se', '山': 'shan', '上': 'shang', '少': 'shao', '社': 'she', '身': 'shen', '深': 'shen', '什': 'shen', '生': 'sheng', '声': 'sheng', '师': 'shi', '十': 'shi', '时': 'shi', '实': 'shi', '食': 'shi', '始': 'shi', '使': 'shi', '世': 'shi', '市': 'shi', '事': 'shi', '是': 'shi', '室': 'shi', '试': 'shi', '视': 'shi', '收': 'shou', '手': 'shou', '首': 'shou', '受': 'shou', '书': 'shu', '树': 'shu', '双': 'shuang', '水': 'shui', '睡': 'shui', '顺': 'shun', '说': 'shuo', '思': 'si', '死': 'si', '四': 'si', '送': 'song', '诉': 'su', '速': 'su', '宿': 'su', '算': 'suan', '虽': 'sui', '岁': 'sui', '孙': 'sun', '所': 'suo', '他': 'ta', '她': 'ta', '它': 'ta', '台': 'tai', '太': 'tai', '态': 'tai', '抬': 'tai', '谈': 'tan', '汤': 'tang', '糖': 'tang', '躺': 'tang', '趟': 'tang', '套': 'tao', '特': 'te', '疼': 'teng', '提': 'ti', '题': 'ti', '体': 'ti', '替': 'ti', '天': 'tian', '田': 'tian', '条': 'tiao', '跳': 'tiao', '贴': 'tie', '铁': 'tie', '听': 'ting', '停': 'ting', '通': 'tong', '同': 'tong', '头': 'tou', '透': 'tou', '图': 'tu', '土': 'tu', '团': 'tuan', '推': 'tui', '腿': 'tui', '外': 'wai', '弯': 'wan', '完': 'wan', '玩': 'wan', '晚': 'wan', '万': 'wan', '王': 'wang', '往': 'wang', '网': 'wang', '望': 'wang', '忘': 'wang', '危': 'wei', '位': 'wei', '文': 'wen', '问': 'wen', '我': 'wo', '屋': 'wu', '五': 'wu', '午': 'wu', '物': 'wu', '务': 'wu', '误': 'wu', '西': 'xi', '吸': 'xi', '希': 'xi', '息': 'xi', '习': 'xi', '洗': 'xi', '喜': 'xi', '系': 'xi', '细': 'xi', '下': 'xia', '夏': 'xia', '先': 'xian', '现': 'xian', '线': 'xian', '相': 'xiang', '想': 'xiang', '向': 'xiang', '象': 'xiang', '像': 'xiang', '小': 'xiao', '校': 'xiao', '笑': 'xiao', '些': 'xie', '写': 'xie', '谢': 'xie', '心': 'xin', '新': 'xin', '信': 'xin', '兴': 'xing', '星': 'xing', '行': 'xing', '形': 'xing', '醒': 'xing', '姓': 'xing', '休': 'xiu', '修': 'xiu', '需': 'xu', '许': 'xu', '学': 'xue', '雪': 'xue', '血': 'xue', '压': 'ya', '呀': 'ya', '牙': 'ya', '言': 'yan', '研': 'yan', '眼': 'yan', '演': 'yan', '阳': 'yang', '养': 'yang', '样': 'yang', '药': 'yao', '要': 'yao', '爷': 'ye', '也': 'ye', '夜': 'ye', '叶': 'ye', '业': 'ye', '一': 'yi', '医': 'yi', '衣': 'yi', '以': 'yi', '已': 'yi', '意': 'yi', '易': 'yi', '因': 'yin', '音': 'yin', '银': 'yin', '引': 'yin', '印': 'yin', '英': 'ying', '影': 'ying', '用': 'yong', '由': 'you', '油': 'you', '游': 'you', '友': 'you', '有': 'you', '又': 'you', '右': 'you', '鱼': 'yu', '雨': 'yu', '语': 'yu', '元': 'yuan', '原': 'yuan', '园': 'yuan', '远': 'yuan', '院': 'yuan', '愿': 'yuan', '月': 'yue', '越': 'yue', '云': 'yun', '允': 'yun', '运': 'yun', '杂': 'za', '再': 'zai', '在': 'zai', '咱': 'zan', '暂': 'zan', '脏': 'zang', '早': 'zao', '怎': 'zen', '站': 'zhan', '张': 'zhang', '长': 'zhang', '掌': 'zhang', '着': 'zhao', '找': 'zhao', '照': 'zhao', '者': 'zhe', '这': 'zhe', '真': 'zhen', '正': 'zheng', '政': 'zheng', '知': 'zhi', '之': 'zhi', '只': 'zhi', '纸': 'zhi', '指': 'zhi', '至': 'zhi', '治': 'zhi', '中': 'zhong', '终': 'zhong', '钟': 'zhong', '种': 'zhong', '重': 'zhong', '周': 'zhou', '洲': 'zhou', '主': 'zhu', '住': 'zhu', '注': 'zhu', '祝': 'zhu', '著': 'zhu', '抓': 'zhua', '专': 'zhuan', '转': 'zhuan', '装': 'zhuang', '准': 'zhun', '桌': 'zhuo', '字': 'zi', '自': 'zi', '自': 'zi', '走': 'zou', '租': 'zu', '足': 'zu', '组': 'zu', '祖': 'zu', '组': 'zu', '嘴': 'zui', '最': 'zui', '昨': 'zuo', '左': 'zuo', '作': 'zuo', '做': 'zuo', '坐': 'zuo', '座': 'zuo', '做': 'zuo'
  };

  function generatePinyin(text) {
    var pinyinEl = document.getElementById('duck-pinyin');
    if (!pinyinEl) return;

    var result = [];
    for (var i = 0; i < text.length; i++) {
      var char = text[i];
      if (pinyinMap[char]) {
        result.push(pinyinMap[char]);
      } else {
        result.push(char);
      }
    }
    pinyinEl.textContent = result.join(' ');
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
        showTranslation(text, response.result, null, targetLang);
      } else {
        showTranslation(text, null, response?.error || 'Translation failed', targetLang);
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
