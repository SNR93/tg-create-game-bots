const MB = 1024 * 1024;

export const TELEGRAM_LIMITS = {
  messageText: 4096,
  mediaCaption: 1024,
  commandDescription: 256,
  invoiceTitle: 32,
  invoiceDescription: 255,
  photoBytes: 10 * MB,
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

export function formatFileSize(bytes) {
  if (bytes < MB) return `${Math.ceil(bytes / 1024)} KB`;
  return `${Math.round(bytes / MB)} MB`;
}

export function mediaRuleText(type, asVideoNote = false) {
  if (type === 'photo') return 'Telegram: изображение до 10 MB.';
  if (type === 'video' && asVideoNote) return 'Telegram: MP4 до 50 MB, для кружка длительность не более 60 сек.';
  if (type === 'video') return 'Telegram: MP4 до 50 MB. Отдельного лимита длительности нет.';
  if (type === 'voice' || type === 'audio') return 'Telegram: аудиофайл до 50 MB. Отдельного лимита длительности нет.';
  return 'Telegram: файл до 50 MB.';
}

export function validateMediaFile(type, file) {
  if (!file) return '';
  const maxBytes = type === 'photo' ? TELEGRAM_LIMITS.photoBytes : TELEGRAM_LIMITS.fileBytes;
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
  for (const node of nodes || []) {
    const label = `нода ${node.data?.nodeId || node.id}`;
    if (node.type === 'simpleMessageNode') checkContent(node.data || {}, label);
    if (node.type === 'messageChainNode') (node.data.messages || []).forEach((item, index) => checkContent(item, `${label}, сообщение ${index + 1}`));
    if (node.type === 'mediaNode') (node.data.items || []).forEach((item, index) => checkContent(item, `${label}, медиа ${index + 1}`));
    if (node.type === 'customCommandNode') check(node.data.description, TELEGRAM_LIMITS.commandDescription, `${label}, описание команды`);
    if (node.type === 'promocodeNode') check(node.data.prompt, TELEGRAM_LIMITS.messageText, `${label}, приглашение ввести промокод`);
  }
  return issues;
}
