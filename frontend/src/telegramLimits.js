/**
 * Codex developer notes:
 * Frontend-зеркало Telegram-лимитов для мгновенной проверки сценария в редакторе.
 * Проверки здесь помогают автору увидеть проблему до запуска бота, но backend всё равно валидирует критичные ограничения.
 * При изменении лимитов синхронизируй этот файл с backend/telegramLimits.js.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import { randomConfigErrors } from './randomUtils';

const MB = 1024 * 1024;
export const TELEGRAM_LIMITS = {
  messageText: 4096,
  mediaCaption: 1024,
  commandDescription: 256,
  invoiceTitle: 32,
  invoiceDescription: 255,
  pollQuestion: 300,
  pollOption: 100,
  inlineKeyboardButtons: 100,
  imageBytes: 5 * MB,
  audioBytes: 10 * MB,
  videoBytes: 50 * MB,
  fileBytes: 50 * MB,
  videoNoteSeconds: 60,
};

export const EDITOR_LIMITS = {
  title: 128,
  shortText: 256,
  key: 64,
  url: 2048,
  comment: 10000,
};

export const SYSTEM_PLACEHOLDERS = {
  'telegram.id': 'Telegram ID пользователя.',
  'telegram.chat_id': 'ID чата, из которого пришло сообщение.',
  'telegram.username': 'Username без @, если он указан в Telegram.',
  'telegram.nickname': 'Username с @, если он указан, иначе имя пользователя.',
  'telegram.first_name': 'Имя пользователя из профиля Telegram.',
  'telegram.last_name': 'Фамилия пользователя из профиля Telegram.',
  'telegram.full_name': 'Имя и фамилия одной строкой.',
  'telegram.mention': 'Кликабельное упоминание/username или имя пользователя.',
  'achievements.unlocked': 'Количество достижений, открытых игроком.',
  'achievements.total': 'Общее количество достижений в сценарии.',
  'achievements.list': 'Список открытых достижений, каждое с новой строки.',
};

export const SYSTEM_PLACEHOLDER_NAMES = Object.keys(SYSTEM_PLACEHOLDERS);

export const SYSTEM_PLACEHOLDER_VARIABLES = Object.fromEntries(
  SYSTEM_PLACEHOLDER_NAMES.map(name => [name, {
    type: name === 'achievements.unlocked' || name === 'achievements.total' ? 'number' : 'text',
    defaultValue: ({
      'telegram.id': '123456789',
      'telegram.chat_id': '123456789',
      'telegram.username': 'username',
      'telegram.nickname': '@username',
      'telegram.first_name': 'Имя',
      'telegram.last_name': 'Фамилия',
      'telegram.full_name': 'Имя Фамилия',
      'telegram.mention': '@username',
      'achievements.unlocked': 0,
      'achievements.total': 0,
    })[name] ?? '',
  }])
);

export function isSystemPlaceholderName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  return normalized.startsWith('codex.')
    || normalized.startsWith('reputation.')
    || normalized.startsWith('inventory.')
    || normalized.startsWith('achievement.')
    || normalized.startsWith('achievements.text.')
    || SYSTEM_PLACEHOLDER_NAMES.some(item => item.toLowerCase() === normalized);
}

export function formatFileSize(bytes) {
  if (bytes < MB) return `${Math.ceil(bytes / 1024)} KB`;
  return `${Math.round(bytes / MB)} MB`;
}

function mediaMaxBytes(type) {
  if (['photo', 'image', 'sticker'].includes(type)) return TELEGRAM_LIMITS.imageBytes;
  if (['audio', 'voice'].includes(type)) return TELEGRAM_LIMITS.audioBytes;
  return TELEGRAM_LIMITS.videoBytes;
}

export function mediaRuleText(type, asVideoNote = false) {
  if (type === 'photo') return 'Изображение до 5 MB.';
  if (type === 'video' && asVideoNote) return 'MP4 до 50 MB, для кружка длительность не более 60 сек.';
  if (type === 'video') return 'MP4 до 50 MB.';
  if (type === 'voice' || type === 'audio') return 'Аудиофайл до 10 MB.';
  return 'Файл до 50 MB.';
}

export function validateMediaFile(type, file) {
  if (!file) return '';
  const maxBytes = mediaMaxBytes(type);
  if (file.size > maxBytes) {
    return `Файл «${file.name}» слишком большой: ${formatFileSize(file.size)}. Максимум ${formatFileSize(maxBytes)}.`;
  }
  if (type === 'photo' && file.type && !file.type.startsWith('image/')) {
    return `Файл «${file.name}» не является изображением.`;
  }
  if (type === 'video' && file.type && file.type !== 'video/mp4') {
    return `Видео «${file.name}» должно быть в формате MP4.`;
  }
  return '';
}

export function validateVideoNoteDuration(duration) {
  return Number.isFinite(duration) && duration > TELEGRAM_LIMITS.videoNoteSeconds
    ? `Видеокружок длится ${Math.ceil(duration)} сек. Максимум ${TELEGRAM_LIMITS.videoNoteSeconds} сек.`
    : '';
}

export function validateScenarioText(nodes) {
  const issues = [];
  const check = (value, max, label) => {
    const length = String(value || '').length;
    if (length > max) issues.push(`Ошибка: ${label}: ${length} символов, максимум ${max}.`);
  };
  const checkContent = (data, label) => {
    if ((data.type || 'text') === 'text') check(data.text, TELEGRAM_LIMITS.messageText, label);
    if (data.type === 'video' && data.asVideoNote) {
      const error = validateVideoNoteDuration(data.duration);
      if (error) issues.push(`Ошибка: ${label}: ${error}`);
    }
  };
  const checkVariableName = (name, label) => {
    const trimmed = String(name || '').trim();
    if (trimmed && isSystemPlaceholderName(trimmed)) {
      issues.push(`Ошибка: ${label}: имя «${trimmed}» зарезервировано системным плейсхолдером.`);
    }
  };
  for (const node of nodes || []) {
    const label = `нода ${node.data?.nodeId || node.id}`;
    if (node.type === 'simpleMessageNode') checkContent(node.data || {}, label);
    if (node.type === 'messageChainNode') (node.data.messages || []).forEach((item, index) => checkContent(item, `${label}, сообщение ${index + 1}`));
    if (node.type === 'mediaNode') (node.data.items || []).forEach((item, index) => checkContent(item, `${label}, медиа ${index + 1}`));
    if (node.type === 'customCommandNode') check(node.data.description, TELEGRAM_LIMITS.commandDescription, `${label}, описание команды`);
    if (node.type === 'promocodeNode') check(node.data.prompt, TELEGRAM_LIMITS.messageText, `${label}, приглашение ввести промокод`);
    if (node.type === 'editMessageNode') check(node.data.text, TELEGRAM_LIMITS.messageText, `${label}, новый текст сообщения`);
    if (node.type === 'pollNode') {
      check(node.data.question, TELEGRAM_LIMITS.pollQuestion, `${label}, вопрос опроса`);
      const options = (node.data.options || []).map(option => typeof option === 'string' ? option : option?.label);
      options.forEach((option, index) => check(option, TELEGRAM_LIMITS.pollOption, `${label}, вариант опроса ${index + 1}`));
      if (options.filter(Boolean).length < 2 || options.filter(Boolean).length > 10) issues.push(`Ошибка: ${label}: у опроса должно быть от 2 до 10 вариантов.`);
    }
    if (node.type === 'keyboardNode' && (node.data.buttons || []).length > TELEGRAM_LIMITS.inlineKeyboardButtons) {
      issues.push(`Ошибка: ${label}: Telegram допускает не более ${TELEGRAM_LIMITS.inlineKeyboardButtons} inline-кнопок в одной клавиатуре.`);
    }
    if (node.type === 'variableNode') (node.data.entries || []).forEach(entry => checkVariableName(entry.varName, `${label}, переменная`));
    if (node.type === 'textInputNode') {
      if (!node.data.varName) issues.push(`Ошибка: ${label}: укажите переменную для сохранения ответа.`);
      checkVariableName(node.data.varName, `${label}, переменная для ответа`);
    }
    if (node.type === 'subscriptionCheckNode' && !node.data.channelId) issues.push(`Ошибка: ${label}: укажите канал для проверки подписки.`);
    if (node.type === 'httpRequestNode') {
      if (!/^https?:\/\//i.test(node.data.url || '')) issues.push(`Ошибка: ${label}: HTTP URL должен начинаться с http:// или https://.`);
      checkVariableName(node.data.responseVar, `${label}, переменная ответа HTTP`);
    }
    if (node.type === 'globalVariableNode') (node.data.entries || []).forEach(entry => checkVariableName(entry.varName, `${label}, глобальная переменная`));
    if (node.type === 'stickerNode' && !node.data.sticker) issues.push(`Ошибка: ${label}: укажите file_id или URL стикера.`);
    if (node.type === 'locationNode' && (!Number.isFinite(+node.data.latitude) || +node.data.latitude < -90 || +node.data.latitude > 90 || !Number.isFinite(+node.data.longitude) || +node.data.longitude < -180 || +node.data.longitude > 180)) issues.push(`Ошибка: ${label}: координаты должны быть в диапазоне широта -90..90, долгота -180..180.`);
    if (node.type === 'randomNode') randomConfigErrors(node.data).forEach(error => issues.push(`Ошибка: ${label}: ${error}`));
  }
  return issues;
}
