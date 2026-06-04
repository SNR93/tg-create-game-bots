const { spawnSync } = require('child_process');
const { randomConfigErrors } = require('./randomUtils');

const MB = 1024 * 1024;

const TELEGRAM_LIMITS = {
  messageText: 4096,
  mediaCaption: 1024,
  commandDescription: 256,
  invoiceTitle: 32,
  invoiceDescription: 255,
  pollQuestion: 300,
  pollOption: 100,
  photoBytes: 10 * MB,
  fileBytes: 50 * MB,
  videoNoteSeconds: 60,
};

const SYSTEM_PLACEHOLDER_NAMES = [
  'telegram.id',
  'telegram.chat_id',
  'telegram.username',
  'telegram.nickname',
  'telegram.first_name',
  'telegram.last_name',
  'telegram.full_name',
  'telegram.mention',
  'achievements.unlocked',
  'achievements.total',
];

function isSystemPlaceholderName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  return normalized.startsWith('codex.') || SYSTEM_PLACEHOLDER_NAMES.some(item => item.toLowerCase() === normalized);
}

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
  if ((type === 'video' || type === 'circle') && mimeType && mimeType !== 'video/mp4') {
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
  const checkVariableName = (name, label) => {
    const trimmed = String(name || '').trim();
    if (trimmed && isSystemPlaceholderName(trimmed)) {
      errors.push(`${label}: имя «${trimmed}» зарезервировано системным плейсхолдером.`);
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
    if (node.type === 'editMessageNode') check(node.data?.text, TELEGRAM_LIMITS.messageText, `${label}, новый текст сообщения`);
    if (node.type === 'pollNode') {
      check(node.data?.question, TELEGRAM_LIMITS.pollQuestion, `${label}, вопрос опроса`);
      (node.data?.options || []).forEach((option, index) => check(option, TELEGRAM_LIMITS.pollOption, `${label}, вариант опроса ${index + 1}`));
      if ((node.data?.options || []).filter(Boolean).length < 2 || (node.data?.options || []).filter(Boolean).length > 10) errors.push(`${label}: у опроса должно быть от 2 до 10 вариантов.`);
    }
    if (node.type === 'variableNode') (node.data?.entries || []).forEach(entry => checkVariableName(entry.varName, `${label}, переменная`));
    if (node.type === 'textInputNode') {
      if (!node.data?.varName) errors.push(`${label}: укажите переменную для сохранения ответа.`);
      checkVariableName(node.data?.varName, `${label}, переменная для ответа`);
    }
    if (node.type === 'subscriptionCheckNode' && !node.data?.channelId) errors.push(`${label}: укажите канал для проверки подписки.`);
    if (node.type === 'httpRequestNode') {
      if (!/^https?:\/\//i.test(node.data?.url || '')) errors.push(`${label}: HTTP URL должен начинаться с http:// или https://.`);
      checkVariableName(node.data?.responseVar, `${label}, переменная ответа HTTP`);
    }
    if (node.type === 'globalVariableNode') (node.data?.entries || []).forEach(entry => checkVariableName(entry.varName, `${label}, глобальная переменная`));
    if (node.type === 'stickerNode' && !node.data?.sticker) errors.push(`${label}: укажите file_id или URL стикера.`);
    if (node.type === 'locationNode' && (!Number.isFinite(+node.data?.latitude) || +node.data.latitude < -90 || +node.data.latitude > 90 || !Number.isFinite(+node.data?.longitude) || +node.data.longitude < -180 || +node.data.longitude > 180)) errors.push(`${label}: координаты должны быть в диапазоне широта -90..90, долгота -180..180.`);
    if (node.type === 'randomNode') randomConfigErrors(node.data).forEach(error => errors.push(`${label}: ${error}`));
  }
  return errors;
}

module.exports = {
  TELEGRAM_LIMITS,
  SYSTEM_PLACEHOLDER_NAMES,
  assertText,
  assertVideoNoteDuration,
  isSystemPlaceholderName,
  probeDuration,
  validateScenario,
  validateUploadedMedia,
};
