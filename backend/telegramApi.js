/**
 * Codex developer notes:
 * Низкоуровневый клиент Telegram Bot API.
 * Слой централизует HTTP-запросы, обработку ошибок Telegram и отправку медиа/сообщений.
 * Runtime должен вызывать этот модуль, а не собирать Telegram-запросы вручную в разных местах.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.webp': 'image/webp',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.mp4':  'video/mp4',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.m4a':  'audio/mp4',
  '.pdf':  'application/pdf',
};

function telegramError(error, status) {
  const message = error?.message || String(error || '');
  if (status === 401 || message === 'Unauthorized') {
    return new Error('Telegram отклонил токен. Проверьте токен в @BotFather и попробуйте снова.');
  }
  if (status === 409) {
    return new Error('Этот Telegram-бот уже запущен в другом месте. Остановите другой экземпляр и попробуйте снова.');
  }
  if (message === 'fetch failed' || error?.cause?.code) {
    return new Error('Не удалось подключиться к Telegram API. Проверьте интернет-соединение сервера и доступ к api.telegram.org.');
  }
  return new Error(message || `Telegram API вернул ошибку${status ? ` ${status}` : ''}.`);
}

function wrapError(error) {
  return error.message?.startsWith('Telegram ') || error.message?.startsWith('Этот ')
    ? error
    : telegramError(error);
}

/**
 * Token-bucket rate limiter.
 * Default: 25 requests/sec — safely below Telegram's 30/sec global limit.
 */
class RateLimiter {
  constructor(maxPerSecond = 25) {
    this.maxPerSecond = maxPerSecond;
    this.tokens = maxPerSecond;
    this.lastRefill = Date.now();
    this.queue = [];
    this.processing = false;
  }

  throttle() {
    return new Promise(resolve => {
      this.queue.push(resolve);
      if (!this.processing) this._process();
    });
  }

  async _process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      if (elapsed >= 1000) {
        this.tokens = this.maxPerSecond;
        this.lastRefill = now;
      }
      if (this.tokens > 0) {
        this.tokens--;
        this.queue.shift()();
      } else {
        const waitMs = Math.max(50, 1000 - (Date.now() - this.lastRefill));
        await new Promise(r => setTimeout(r, waitMs));
        this.tokens = this.maxPerSecond;
        this.lastRefill = Date.now();
      }
    }
    this.processing = false;
  }
}

function resolveLocalPath(url, mediaDir) {
  if (!url?.startsWith('/api/media/')) return null;
  const relative = decodeURIComponent(url.slice('/api/media/'.length));
  const target = path.resolve(mediaDir, relative);
  const root = path.resolve(mediaDir) + path.sep;
  return target.startsWith(root) && fs.existsSync(target) ? target : null;
}

async function apiRequest(token, rateLimiter, method, payload = {}) {
  await rateLimiter.throttle();
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw telegramError(new Error(data.description), response.status);
    }
    return data.result;
  } catch (error) {
    throw wrapError(error);
  }
}

async function apiUpload(token, rateLimiter, method, field, chatId, filePath, data = {}) {
  await rateLimiter.throttle();
  const form = new FormData();
  form.append('chat_id', String(chatId));
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  }
  const mimeType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  form.append(field, new Blob([fs.readFileSync(filePath)], { type: mimeType }), path.basename(filePath));
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      body: form,
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw telegramError(new Error(result.description), response.status);
    }
    return result.result;
  } catch (error) {
    throw wrapError(error);
  }
}

async function apiSendMediaGroup(token, rateLimiter, chatId, items, mediaDir) {
  await rateLimiter.throttle();
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (items.some(item => item.protected)) form.append('protect_content', 'true');
  const media = items.map((item, index) => {
    const localPath = resolveLocalPath(item.url, mediaDir);
    if (localPath) {
      const field = `file${index}`;
      form.append(field, new Blob([fs.readFileSync(localPath)]), path.basename(localPath));
      return { type: item.type, media: `attach://${field}`, has_spoiler: item.protected || undefined };
    }
    return { type: item.type, media: item.url, has_spoiler: item.protected || undefined };
  });
  form.append('media', JSON.stringify(media));
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, { method: 'POST', body: form });
    const result = await response.json();
    if (!response.ok || !result.ok) throw telegramError(new Error(result.description), response.status);
    return result.result;
  } catch (error) {
    throw wrapError(error);
  }
}

module.exports = { RateLimiter, resolveLocalPath, apiRequest, apiUpload, apiSendMediaGroup, telegramError };
