const { spawnSync } = require('child_process');

const MB = 1024 * 1024;

const TELEGRAM_LIMITS = {
  messageText: 4096,
  mediaCaption: 1024,
  commandDescription: 256,
  invoiceTitle: 32,
  invoiceDescription: 255,
  photoBytes: 10 * MB,
  fileBytes: 50 * MB,
  videoNoteSeconds: 60,
};

function formatMb(bytes) {
  return `${Math.round(bytes / MB)} MB`;
}

function validateUploadedMedia(type, size, mimeType = '') {
  const maxBytes = type === 'photo' ? TELEGRAM_LIMITS.photoBytes : TELEGRAM_LIMITS.fileBytes;
  if (!Number.isFinite(size) || size <= 0) return 'Файл пустой.';
  if (size > maxBytes) {
    return `Файл слишком большой для Telegram: максимум ${formatMb(maxBytes)} для типа «${type}».`;
  }
  if (type === 'photo' && mimeType && !mimeType.startsWith('image/')) {
    return 'Для фотографии выберите изображение.';
  }
  if (type === 'video' && mimeType && mimeType !== 'video/mp4') {
    return 'Telegram отправляет видео как видео только в формате MP4.';
  }
  return null;
}

function probeDuration(filePath) {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf8', timeout: 10000 });
  const duration = Number.parseFloat(result.stdout);
  return Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null;
}

function assertVideoNoteDuration(filePath) {
  const duration = probeDuration(filePath);
  if (duration === null) {
    const error = new Error('Не удалось определить длительность видео. Загрузите корректный MP4-файл.');
    error.status = 400;
    throw error;
  }
  if (duration !== null && duration > TELEGRAM_LIMITS.videoNoteSeconds) {
    const error = new Error(`Видеокружок длится ${Math.ceil(duration)} сек. Telegram допускает не более ${TELEGRAM_LIMITS.videoNoteSeconds} сек.`);
    error.status = 400;
    throw error;
  }
  return duration;
}

function assertText(value, maxLength, label) {
  const text = String(value || '');
  if (text.length > maxLength) {
    const error = new Error(`${label}: введено ${text.length} символов, максимум ${maxLength}.`);
    error.status = 400;
    throw error;
  }
}

function validateScenario(bot, resolveLocalMediaPath) {
  const errors = [];
  const check = (value, maxLength, label) => {
    try {
      assertText(value, maxLength, label);
    } catch (error) {
      errors.push(error.message);
    }
  };
  const checkContent = (data, label) => {
    if ((data.type || 'text') === 'text') check(data.text, TELEGRAM_LIMITS.messageText, label);
    if (data.type === 'video' && data.asVideoNote && data.url) {
      const localPath = resolveLocalMediaPath?.(data.url);
      if (localPath) {
        try {
          assertVideoNoteDuration(localPath);
        } catch (error) {
          errors.push(`${label}: ${error.message}`);
        }
      }
    }
  };

  for (const node of bot.nodes || []) {
    const label = `Нода ${node.data?.nodeId || node.id}`;
    if (node.type === 'simpleMessageNode') checkContent(node.data || {}, label);
    if (node.type === 'messageChainNode') {
      (node.data?.messages || []).forEach((message, index) => checkContent(message, `${label}, сообщение ${index + 1}`));
    }
    if (node.type === 'mediaNode') {
      (node.data?.items || []).forEach((item, index) => checkContent(item, `${label}, медиа ${index + 1}`));
    }
    if (node.type === 'customCommandNode') {
      check(node.data?.description, TELEGRAM_LIMITS.commandDescription, `${label}, описание команды`);
    }
    if (node.type === 'promocodeNode') check(node.data?.prompt, TELEGRAM_LIMITS.messageText, `${label}, приглашение ввести промокод`);
  }
  return errors;
}

module.exports = {
  TELEGRAM_LIMITS,
  assertText,
  assertVideoNoteDuration,
  probeDuration,
  validateScenario,
  validateUploadedMedia,
};
