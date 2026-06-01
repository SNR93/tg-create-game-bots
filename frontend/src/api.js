import { validateMediaFile } from './telegramLimits';

const BASE = '/api';
export async function listBots() {
  const r = await fetch(`${BASE}/bots`);
  return r.json();
}

export async function createBot(name) {
  const r = await fetch(`${BASE}/bots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return r.json();
}

export async function getBot(id) {
  const r = await fetch(`${BASE}/bots/${id}`);
  return r.json();
}

export async function saveBot(id, data) {
  const r = await fetch(`${BASE}/bots/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || 'Не удалось сохранить сценарий');
  return result;
}

async function telegramRequest(id, path = '', options) {
  try {
    const r = await fetch(`${BASE}/bots/${id}/telegram${path}`, options);
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

export async function uploadBotMedia(id, type, file) {
  const validationError = validateMediaFile(type, file);
  if (validationError) throw new Error(validationError);
  const r = await fetch(`${BASE}/bots/${id}/media/${type}`, {
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
  const r = await fetch(`${BASE}/bots/${id}`, { method: 'DELETE' });
  return r.json();
}

export function downloadBotUrl(id) {
  return `${BASE}/bots/${id}/download`;
}

async function adminRequest(id, path = '', options) {
  const response = await fetch(`${BASE}/bots/${id}/admin${path}`, options);
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
export const listBotVersions = id => adminRequest(id, '/versions');
export const createBotVersion = id => adminRequest(id, '/versions', { method: 'POST' });
export const publishBotVersion = (id, versionId, rolloutPercentage = 100) => adminRequest(id, `/versions/${encodeURIComponent(versionId)}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rolloutPercentage }) });
export const listBotBackups = id => adminRequest(id, '/backups');
export const createBotBackup = id => adminRequest(id, '/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
export const restoreBotBackup = (id, backupId) => adminRequest(id, `/backups/${encodeURIComponent(backupId)}/restore`, { method: 'POST' });
export const listBotJobs = id => adminRequest(id, '/jobs');
export const createBotJob = (id, job) => adminRequest(id, '/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job) });
export const listBotProducts = id => adminRequest(id, '/products');
export const saveBotProduct = (id, key, data) => adminRequest(id, `/products/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const deleteBotProduct = (id, key) => adminRequest(id, `/products/${encodeURIComponent(key)}`, { method: 'DELETE' });
export const listBotRoles = id => adminRequest(id, '/roles');
export const saveBotRole = (id, key, role) => adminRequest(id, `/roles/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
export const deleteBotRole = (id, key) => adminRequest(id, `/roles/${encodeURIComponent(key)}`, { method: 'DELETE' });

export function resetBotPlayer(id, playerId) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}/reset`, { method: 'POST' });
}

export function deleteBotPlayer(id, playerId) {
  return adminRequest(id, `/players/${encodeURIComponent(playerId)}`, { method: 'DELETE' });
}
