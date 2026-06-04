import { validateMediaFile } from './telegramLimits';

const BASE = '/api';
const AUTH_TOKEN_KEY = 'tgbot_auth_token';

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

export function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers, credentials: 'include' });
}

async function readJson(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallbackMessage);
  return data;
}

export async function login(loginValue, password) {
  const response = await apiFetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginValue, password }),
  });
  const data = await readJson(response, 'Не удалось войти');
  localStorage.removeItem(AUTH_TOKEN_KEY);
  return data.user;
}

export async function getCurrentUser() {
  const response = await apiFetch(`${BASE}/auth/me`);
  const data = await readJson(response, 'Сессия истекла');
  return data.user;
}

export async function getProfile() {
  const response = await apiFetch(`${BASE}/profile`);
  return readJson(response, 'Не удалось загрузить профиль');
}

export async function updateProfile(data) {
  const response = await apiFetch(`${BASE}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return readJson(response, 'Не удалось сохранить профиль');
}

export async function changePassword(currentPassword, newPassword) {
  const response = await apiFetch(`${BASE}/profile/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return readJson(response, 'Не удалось изменить пароль');
}

export async function listUsers() {
  const response = await apiFetch(`${BASE}/users`);
  return readJson(response, 'Не удалось загрузить пользователей');
}

export async function createUser(data) {
  const response = await apiFetch(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return readJson(response, 'Не удалось создать пользователя');
}

export async function updateUser(login, data) {
  const response = await apiFetch(`${BASE}/users/${encodeURIComponent(login)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return readJson(response, 'Не удалось сохранить пользователя');
}

export async function deleteUser(login) {
  const response = await apiFetch(`${BASE}/users/${encodeURIComponent(login)}`, { method: 'DELETE' });
  return readJson(response, 'Не удалось удалить пользователя');
}

export async function getUserProfile(login) {
  const response = await apiFetch(`${BASE}/users/${encodeURIComponent(login)}/profile`);
  return readJson(response, 'Не удалось загрузить профиль пользователя');
}

export async function listBots() {
  const r = await apiFetch(`${BASE}/bots`);
  return readJson(r, 'Не удалось загрузить список ботов');
}

export async function createBot(name, comment = '') {
  const r = await apiFetch(`${BASE}/bots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, comment })
  });
  return readJson(r, 'Не удалось создать бота');
}

export async function getBot(id) {
  const r = await apiFetch(`${BASE}/bots/${id}`);
  return readJson(r, 'Не удалось загрузить бота');
}

export async function saveBot(id, data) {
  const r = await apiFetch(`${BASE}/bots/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || 'Не удалось сохранить сценарий');
  return result;
}

export async function updateBotComment(id, comment) {
  const r = await apiFetch(`${BASE}/bots/${id}/comment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
  return readJson(r, 'Не удалось сохранить комментарий');
}

async function telegramRequest(id, path = '', options) {
  try {
    const r = await apiFetch(`${BASE}/bots/${id}/telegram${path}`, options);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Ошибка управления Telegram-ботом');
    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Не удалось связаться с сервером конструктора. Проверьте, что backend запущен.');
    }
    throw error;
  }
}

export function getTelegramStatus(id) {
  return telegramRequest(id);
}

export function startTelegramBot(id, token) {
  return telegramRequest(id, '/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

export function stopTelegramBot(id) {
  return telegramRequest(id, '/stop', { method: 'POST' });
}

async function telegramBackupRequest(path = '', options) {
  const response = await apiFetch(`${BASE}/telegram-backup${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ошибка Telegram-бэкапа');
  return data;
}

export function getTelegramBackupSettings() {
  return telegramBackupRequest();
}

export function saveTelegramBackupSettings(settings) {
  return telegramBackupRequest('', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export function sendTelegramBackupNow() {
  return telegramBackupRequest('/send', { method: 'POST' });
}

export async function restoreTelegramBackup(file) {
  const response = await apiFetch(`${BASE}/telegram-backup/restore`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/gzip' },
    body: file,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось восстановить бэкап');
  return data;
}

export async function uploadProfileAvatar(file) {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!allowed.includes(file.type)) throw new Error('Разрешены только PNG и JPG/JPEG файлы');
  if (file.size > 5 * 1024 * 1024) throw new Error('Файл слишком большой (максимум 5 МБ)');
  const r = await apiFetch(`${BASE}/profile/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  return readJson(r, 'Не удалось загрузить аватар');
}

export async function uploadBotMedia(id, type, file) {
  const validationError = validateMediaFile(type, file);
  if (validationError) throw new Error(validationError);
  const r = await apiFetch(`${BASE}/bots/${id}/media/${type}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Не удалось загрузить файл');
  return data;
}

export async function deleteBot(id) {
  const r = await apiFetch(`${BASE}/bots/${id}`, { method: 'DELETE' });
  return readJson(r, 'Не удалось удалить бота');
}

export async function downloadBot(id, name = 'bot') {
  const response = await apiFetch(`${BASE}/bots/${id}/download`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось скачать JSON');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name || 'bot'}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function adminRequest(id, path = '', options) {
  const response = await apiFetch(`${BASE}/bots/${id}/admin${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ошибка административного API');
  return data;
}

export function listBotPlayers(id, query = '') {
  return adminRequest(id, `/players?q=${encodeURIComponent(query)}`);
}

export function createBotPlayer(id, player) {
  return adminRequest(id, '/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(player),
  });
}

export function getBotPlayer(id, playerId) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}`);
}

export function setBotPlayerVariable(id, playerId, name, variable) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/variables/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(variable),
  });
}

export function deleteBotPlayerVariable(id, playerId, name) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/variables/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export function setBotPlayerInventoryItem(id, playerId, itemKey, item) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/inventory/${encodeURIComponent(itemKey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
}

export function deleteBotPlayerInventoryItem(id, playerId, itemKey) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/inventory/${encodeURIComponent(itemKey)}`, { method: 'DELETE' });
}

export function setBotPlayerRelation(id, playerId, characterKey, relation) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/relations/${encodeURIComponent(characterKey)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(relation),
  });
}

export function deleteBotPlayerRelation(id, playerId, characterKey) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/relations/${encodeURIComponent(characterKey)}`, { method: 'DELETE' });
}

export function setBotPlayerAchievement(id, playerId, achievementKey, achievement = {}) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/achievements/${encodeURIComponent(achievementKey)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(achievement),
  });
}

export function deleteBotPlayerAchievement(id, playerId, achievementKey) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/achievements/${encodeURIComponent(achievementKey)}`, { method: 'DELETE' });
}

export const listBotPromocodes = id => adminRequest(id, '/promocodes');
export const saveBotPromocode = (id, code, data) => adminRequest(id, `/promocodes/${encodeURIComponent(code)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const deleteBotPromocode = (id, code) => adminRequest(id, `/promocodes/${encodeURIComponent(code)}`, { method: 'DELETE' });
export const getBotAnalytics = id => adminRequest(id, '/analytics');
// Global bot variables
export const listBotGlobals = id => adminRequest(id, '/globals');
export const setBotGlobal = (id, name, data) => adminRequest(id, `/globals/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const deleteBotGlobal = (id, name) => adminRequest(id, `/globals/${encodeURIComponent(name)}`, { method: 'DELETE' });

export const listBotVersions = id => adminRequest(id, '/versions');
export const createBotVersion = id => adminRequest(id, '/versions', { method: 'POST' });
export const publishBotVersion = (id, versionId, rolloutPercentage = 100) => adminRequest(id, `/versions/${encodeURIComponent(versionId)}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rolloutPercentage }) });
export const listBotBackups = id => adminRequest(id, '/backups');
export const createBotBackup = id => adminRequest(id, '/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
export const restoreBotBackup = (id, backupId) => adminRequest(id, `/backups/${encodeURIComponent(backupId)}/restore`, { method: 'POST' });
export const listBotJobs = id => adminRequest(id, '/jobs');
export const createBotJob = (id, job) => adminRequest(id, '/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job) });
export const broadcastCount = (id, body) => adminRequest(id, '/broadcast-count', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const listBotProducts = id => adminRequest(id, '/products');
export const saveBotProduct = (id, key, data) => adminRequest(id, `/products/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const deleteBotProduct = (id, key) => adminRequest(id, `/products/${encodeURIComponent(key)}`, { method: 'DELETE' });
export const getBotMyRole = async id => { const r = await apiFetch(`${BASE}/bots/${encodeURIComponent(id)}/my-role`); return readJson(r, 'Не удалось получить роль'); };
export const listBotRoles = id => adminRequest(id, '/roles');
export const saveBotRole = (id, key, role, comment = '') => adminRequest(id, `/roles/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, comment }) });
export const deleteBotRole = (id, key) => adminRequest(id, `/roles/${encodeURIComponent(key)}`, { method: 'DELETE' });

// Node history
export async function getNodeHistory(botId, nodeId) {
  const r = await apiFetch(`${BASE}/bots/${botId}/history/node/${encodeURIComponent(nodeId)}`);
  return readJson(r, 'Не удалось загрузить историю');
}
export async function saveNodeHistorySnapshot(botId, nodeId, comment) {
  const r = await apiFetch(`${BASE}/bots/${botId}/history/node/${encodeURIComponent(nodeId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
  return readJson(r, 'Не удалось сохранить снимок');
}
export async function updateNodeHistoryComment(botId, nodeId, entryId, comment) {
  const r = await apiFetch(`${BASE}/bots/${botId}/history/node/${encodeURIComponent(nodeId)}/${encodeURIComponent(entryId)}/comment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
  return readJson(r, 'Не удалось обновить комментарий');
}
export async function deleteNodeHistoryEntry(botId, nodeId, entryId) {
  const r = await apiFetch(`${BASE}/bots/${botId}/history/node/${encodeURIComponent(nodeId)}/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
  return readJson(r, 'Не удалось удалить запись');
}

export function resetBotPlayer(id, playerId) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/reset`, { method: 'POST' });
}

export function deleteBotPlayer(id, playerId) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}`, { method: 'DELETE' });
}
