const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { randomUUID } = crypto;
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFile, spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const telegramRuntime = require('./telegramRuntime');
const { initDatabase, pool } = require('./database');
const playerStore = require('./playerStore');
const adminStore = require('./adminStore');
const { startJobWorker } = require('./jobQueue');
const { TELEGRAM_LIMITS, assertText, probeDuration, validateScenario, validateUploadedMedia } = require('./telegramLimits');

const app = express();
const PORT = 3001;
const BOTS_DIR = path.join(__dirname, 'data', 'bots');
const MEDIA_DIR = path.join(__dirname, 'data', 'media');
const DATABASE_BACKUP_PATH = 'db/tgbot.sql';
const MAX_NODE_HISTORY = 50;
const TELEGRAM_BACKUP_SETTINGS_PATH = path.join(__dirname, 'data', 'telegram-backup.json');
const USER_STORE_PATH = path.join(__dirname, 'data', 'users.json');
const AUTH_COOKIE = 'tgbot_session';
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const MEDIA_FOLDERS = {
  photo: 'images',
  image: 'images',
  sticker: 'stickers',
  video: 'video',
  circle: 'circle',
  voice: 'voice',
  audio: 'audio',
  document: 'documents',
};

function execFileBuffer(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      ...options,
      encoding: 'buffer',
      maxBuffer: options.maxBuffer || 1024 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr?.toString('utf-8') || '';
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

function spawnWithInput(command, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      if (code !== 0) {
        const error = new Error(`${command} exited with code ${code}: ${err.toString('utf-8')}`);
        error.stdout = out.toString('utf-8');
        error.stderr = err.toString('utf-8');
        reject(error);
      } else {
        resolve({ stdout: out, stderr: err });
      }
    });
    child.stdin.end(input);
  });
}

function parseAuthUsers(value) {
  return Object.fromEntries(String(value || '').split(',').map(pair => {
    const index = pair.indexOf(':');
    if (index === -1) return null;
    const login = pair.slice(0, index).trim();
    const password = pair.slice(index + 1);
    return login && password ? [login, password] : null;
  }).filter(Boolean));
}

const ENV_AUTH_USERS = parseAuthUsers(process.env.AUTH_USERS);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const candidate = hashPassword(password, parts[1]);
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(storedHash));
}

function readUsers() {
  try {
    const data = JSON.parse(fs.readFileSync(USER_STORE_PATH, 'utf-8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(USER_STORE_PATH), { recursive: true });
  fs.writeFileSync(USER_STORE_PATH, JSON.stringify(users, null, 2));
}

function userPublic(user) {
  if (!user) return null;
  return {
    login: user.login,
    role: user.role || 'user',
    avatar: user.avatar || '',
    about: user.about || '',
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

function ensureUserStore() {
  const now = new Date().toISOString();
  const users = readUsers();
  let changed = false;
  if (!users.admin) {
    users.admin = {
      login: 'admin',
      role: 'admin',
      passwordHash: hashPassword('changethispassword'),
      avatar: '',
      about: 'Default administrator account. Change this password after first login.',
      createdAt: now,
      updatedAt: now,
    };
    changed = true;
  }
  for (const login of Object.keys(ENV_AUTH_USERS)) {
    if (!users[login]) {
      users[login] = {
        login,
        role: login === 'SNR93' || login === 'admin' ? 'admin' : 'user',
        passwordHash: '',
        avatar: '',
        about: '',
        createdAt: now,
        updatedAt: now,
      };
      changed = true;
    }
  }
  if (changed) writeUsers(users);
  return users;
}

function getAuthUser(login) {
  const users = ensureUserStore();
  return users[login] || (ENV_AUTH_USERS[login] ? { login, role: login === 'SNR93' || login === 'admin' ? 'admin' : 'user', envPassword: ENV_AUTH_USERS[login] } : null);
}

function authUserExists(login) {
  return !!getAuthUser(login);
}

function checkLoginPassword(login, password) {
  const user = getAuthUser(login);
  if (!user) return false;
  if (user.envPassword !== undefined) return user.envPassword === password;
  if (ENV_AUTH_USERS[login] === password) return true;
  return verifyPassword(password, user.passwordHash);
}

function canManageUsers(login) {
  const user = getAuthUser(login);
  return login === 'SNR93' || login === 'admin' || user?.role === 'admin';
}

if (!Object.keys(ENV_AUTH_USERS).length) {
  console.warn('AUTH_USERS is empty. File users store is active; default admin account is available.');
}

function readTelegramBackupSettings() {
  try {
    const settings = JSON.parse(fs.readFileSync(TELEGRAM_BACKUP_SETTINGS_PATH, 'utf-8'));
    return {
      enabled: !!settings.enabled,
      token: String(settings.token || ''),
      chatId: String(settings.chatId || ''),
      scheduleTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.scheduleTime || '') ? settings.scheduleTime : '03:00',
      lastSentAt: settings.lastSentAt || null,
      lastScheduledDate: settings.lastScheduledDate || null,
      lastError: settings.lastError || '',
    };
  } catch {
    return { enabled: false, token: '', chatId: '', scheduleTime: '03:00', lastSentAt: null, lastScheduledDate: null, lastError: '' };
  }
}

function saveTelegramBackupSettings(patch) {
  const next = { ...readTelegramBackupSettings(), ...patch };
  next.enabled = !!next.enabled;
  next.token = String(next.token || '').trim();
  next.chatId = String(next.chatId || '').trim();
  next.scheduleTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(next.scheduleTime || '') ? next.scheduleTime : '03:00';
  fs.writeFileSync(TELEGRAM_BACKUP_SETTINGS_PATH, JSON.stringify(next, null, 2));
  return next;
}

function splitTarPath(name) {
  const clean = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (Buffer.byteLength(clean) <= 100) return { name: clean, prefix: '' };
  const parts = clean.split('/');
  const fileName = parts.pop();
  const prefix = parts.join('/');
  if (Buffer.byteLength(fileName) > 100 || Buffer.byteLength(prefix) > 155) {
    throw new Error(`Слишком длинный путь для архива: ${clean}`);
  }
  return { name: fileName, prefix };
}

function writeTarString(buffer, offset, length, value) {
  const bytes = Buffer.from(String(value || ''), 'utf-8');
  bytes.copy(buffer, offset, 0, Math.min(bytes.length, length));
}

function writeTarOctal(buffer, offset, length, value) {
  const text = Math.max(0, Number(value) || 0).toString(8).padStart(length - 1, '0');
  buffer.write(text.slice(-(length - 1)) + '\0', offset, length, 'ascii');
}

function createTarHeader(name, size, mtime) {
  const header = Buffer.alloc(512);
  const split = splitTarPath(name);
  writeTarString(header, 0, 100, split.name);
  writeTarOctal(header, 100, 8, 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, size);
  writeTarOctal(header, 136, 12, Math.floor(mtime / 1000));
  header.fill(' ', 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeTarString(header, 257, 6, 'ustar');
  writeTarString(header, 263, 2, '00');
  writeTarString(header, 345, 155, split.prefix);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeTarOctal(header, 148, 8, checksum);
  return header;
}

function collectFiles(baseDir, archiveRoot) {
  if (!fs.existsSync(baseDir)) return [];
  const result = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) {
        result.push({
          fullPath,
          archivePath: `${archiveRoot}/${path.relative(baseDir, fullPath).replace(/\\/g, '/')}`,
          stat: fs.statSync(fullPath),
        });
      }
    }
  }
  walk(baseDir);
  return result;
}

async function createDatabaseDump() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://tgbot:tgbot@localhost:5433/tgbot';
  const { stdout } = await execFileBuffer('pg_dump', [
    '--dbname', databaseUrl,
    '--format=plain',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
  ]);
  return stdout;
}

async function restoreDatabaseDump(dumpBuffer) {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://tgbot:tgbot@localhost:5433/tgbot';
  const prelude = Buffer.from(`
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid();
`, 'utf-8');
  await spawnWithInput('psql', [
    '--dbname', databaseUrl,
    '--single-transaction',
    '--set', 'ON_ERROR_STOP=1',
  ], Buffer.concat([prelude, Buffer.from('\n', 'utf-8'), dumpBuffer]));
}

function appendTarEntry(chunks, archivePath, data, mtimeMs = Date.now()) {
  chunks.push(createTarHeader(archivePath, data.length, mtimeMs));
  chunks.push(data);
  const padding = (512 - (data.length % 512)) % 512;
  if (padding) chunks.push(Buffer.alloc(padding));
}

async function createBotsMediaArchive() {
  const chunks = [];
  const files = [
    ...collectFiles(BOTS_DIR, 'bots'),
    ...collectFiles(MEDIA_DIR, 'media'),
  ];
  for (const file of files) {
    const data = fs.readFileSync(file.fullPath);
    appendTarEntry(chunks, file.archivePath, data, file.stat.mtimeMs);
  }
  appendTarEntry(chunks, DATABASE_BACKUP_PATH, await createDatabaseDump());
  chunks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(chunks), { level: 9 });
}

function readTarString(buffer, start, length) {
  const slice = buffer.slice(start, start + length);
  const nul = slice.indexOf(0);
  return slice.slice(0, nul >= 0 ? nul : slice.length).toString('utf-8').trim();
}

function parseTarOctal(buffer, start, length) {
  return parseInt(readTarString(buffer, start, length).trim() || '0', 8) || 0;
}

function safeRestorePath(root, relPath) {
  const clean = String(relPath || '').replace(/\\/g, '/');
  if (!clean || clean.startsWith('/') || clean.includes('..')) throw new Error(`Недопустимый путь в архиве: ${relPath}`);
  const target = path.resolve(root, clean);
  const base = path.resolve(root);
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error(`Недопустимый путь в архиве: ${relPath}`);
  return target;
}

async function restoreBotsMediaArchive(archiveBuffer) {
  const tar = zlib.gunzipSync(archiveBuffer);
  const tempRoot = path.join(__dirname, 'data', `.restore-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  const tempBots = path.join(tempRoot, 'bots');
  const tempMedia = path.join(tempRoot, 'media');
  fs.mkdirSync(tempBots, { recursive: true });
  fs.mkdirSync(tempMedia, { recursive: true });
  let offset = 0;
  let files = 0;
  let databaseDump = null;
  try {
    while (offset + 512 <= tar.length) {
      const header = tar.slice(offset, offset + 512);
      offset += 512;
      if (header.every(byte => byte === 0)) break;
      const name = readTarString(header, 0, 100);
      const prefix = readTarString(header, 345, 155);
      const archivePath = [prefix, name].filter(Boolean).join('/');
      const size = parseTarOctal(header, 124, 12);
      const type = String.fromCharCode(header[156] || 48);
      const data = tar.slice(offset, offset + size);
      offset += size + ((512 - (size % 512)) % 512);
      if (type !== '0' && type !== '\0') continue;
      if (archivePath === DATABASE_BACKUP_PATH) {
        databaseDump = Buffer.from(data);
        files += 1;
        continue;
      }
      if (!archivePath.startsWith('bots/') && !archivePath.startsWith('media/')) continue;
      const target = archivePath.startsWith('bots/')
        ? safeRestorePath(tempBots, archivePath.slice(5))
        : safeRestorePath(tempMedia, archivePath.slice(6));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      files += 1;
    }
    if (databaseDump) {
      await restoreDatabaseDump(databaseDump);
    }
    fs.rmSync(BOTS_DIR, { recursive: true, force: true });
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
    fs.renameSync(tempBots, BOTS_DIR);
    fs.renameSync(tempMedia, MEDIA_DIR);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return { files, databaseRestored: !!databaseDump };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function moscowNowParts() {
  const shifted = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}

async function sendTelegramBackup(settings = readTelegramBackupSettings(), reason = 'manual') {
  if (!settings.token) throw new Error('Укажите Telegram-токен для бэкапа.');
  if (!settings.chatId) throw new Error('Укажите Telegram chat ID получателя.');
  const archive = await createBotsMediaArchive();
  const fileName = `tg-bots-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`;
  const form = new FormData();
  form.append('chat_id', settings.chatId);
  form.append('caption', `Бэкап ботов и медиа: ${reason}, ${new Date().toISOString()}`);
  form.append('document', new Blob([archive], { type: 'application/gzip' }), fileName);
  const response = await fetch(`https://api.telegram.org/bot${settings.token}/sendDocument`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.description || 'Telegram не принял архив.');
  saveTelegramBackupSettings({ lastSentAt: new Date().toISOString(), lastError: '' });
  return { ok: true, fileName, size: archive.length, telegram: data.result };
}

let telegramBackupBusy = false;

async function runTelegramBackupSchedule() {
  if (telegramBackupBusy) return;
  const settings = readTelegramBackupSettings();
  if (!settings.enabled || !settings.token || !settings.chatId) return;
  const now = moscowNowParts();
  if (now.time !== settings.scheduleTime || settings.lastScheduledDate === now.date) return;
  telegramBackupBusy = true;
  try {
    await sendTelegramBackup(settings, 'schedule');
    saveTelegramBackupSettings({ lastScheduledDate: now.date, lastError: '' });
  } catch (error) {
    saveTelegramBackupSettings({ lastScheduledDate: now.date, lastError: error.message });
  } finally {
    telegramBackupBusy = false;
  }
}

fs.mkdirSync(BOTS_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

app.use(cors());
app.use('/api/media', express.static(MEDIA_DIR));

function getBotPath(id) {
  return path.join(BOTS_DIR, `${id}.json`);
}

function getNodeHistoryPath(botId) {
  return path.join(BOTS_DIR, `${botId}-history.json`);
}
function readNodeHistory(botId) {
  const p = getNodeHistoryPath(botId);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}
function writeNodeHistory(botId, history) {
  fs.writeFileSync(getNodeHistoryPath(botId), JSON.stringify(history, null, 2));
}
function stripNodeUiFields(data) {
  if (!data || typeof data !== 'object') return data;
  const { __expanded, __debugActive, ...rest } = data;
  return rest;
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function safeFileName(value) {
  const base = path.basename(String(value || 'file'));
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'file';
}

function listBots() {
  const files = fs.readdirSync(BOTS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(BOTS_DIR, f), 'utf-8'));
      if (!data?.id || !data?.name || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
      return {
        id: data.id,
        name: data.name,
        createdAt: data.createdAt || data.updatedAt,
        updatedAt: data.updatedAt,
        createdBy: data.createdBy || 'unknown',
        comment: data.comment || '',
      };
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt));
}

function normalizeBotName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function findBotByName(name, exceptId = '') {
  const normalized = normalizeBotName(name).toLocaleLowerCase('ru');
  if (!normalized) return null;
  return listBots().find(bot => bot.id !== exceptId && normalizeBotName(bot.name).toLocaleLowerCase('ru') === normalized);
}

function sanitizeComment(comment) {
  return String(comment || '').trim().slice(0, 500);
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header || '').split(';').map(part => {
    const index = part.indexOf('=');
    if (index === -1) return null;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    return key ? [key, decodeURIComponent(value)] : null;
  }).filter(Boolean));
}

function signAuthPayload(payload) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
}

function createAuthToken(login) {
  const payload = Buffer.from(JSON.stringify({
    login,
    exp: Math.floor(Date.now() / 1000) + AUTH_MAX_AGE_SECONDS,
  })).toString('base64url');
  return `${payload}.${signAuthPayload(payload)}`;
}

function verifyAuthToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = signAuthPayload(payload);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!data.login || !authUserExists(data.login) || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.login;
  } catch {
    return null;
  }
}

function cookieOptions(req, maxAge = AUTH_MAX_AGE_SECONDS) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  return [
    `${AUTH_COOKIE}=`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean);
}

function setAuthCookie(req, res, token) {
  const parts = cookieOptions(req);
  parts[0] = `${AUTH_COOKIE}=${encodeURIComponent(token)}`;
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(req, res) {
  res.setHeader('Set-Cookie', cookieOptions(req, 0).join('; '));
}

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const cookieToken = parseCookies(req.get('cookie'))[AUTH_COOKIE];
  const login = verifyAuthToken(bearerToken) || verifyAuthToken(cookieToken);
  if (!login) return res.status(401).json({ error: 'Требуется авторизация' });
  req.user = userPublic(getAuthUser(login)) || { login };
  next();
}

function requireSnr93(req, res, next) {
  if (req.user?.login !== 'SNR93') return res.status(403).json({ error: 'Доступно только пользователю SNR93' });
  next();
}

function requireUserManager(req, res, next) {
  if (!canManageUsers(req.user?.login)) return res.status(403).json({ error: 'Недостаточно прав для управления пользователями' });
  next();
}

function createBotTemplate(template = 'empty') {
  const node = (type, x, y, data = {}) => {
    const id = uuidv4();
    return { id, type, position: { x, y }, data: { ...data, nodeId: id.slice(0, 7) } };
  };
  const edge = (source, target, sourceHandle = 'continue') => ({
    id: uuidv4(), source: source.id, target: target.id, sourceHandle, targetHandle: 'in',
  });
  const menu = node('menuNode', 160, 120, { title: 'Глобальное меню' });
  if (template === 'empty') return { nodes: [menu], edges: [] };

  const continuation = node('continueStoryNode', 440, 80, { title: 'Продолжить историю' });
  const greeting = node('simpleMessageNode', 440, 260, {
    type: 'text',
    text: template === 'quiz' ? 'Ответьте на вопрос:' : template === 'shop' ? 'Добро пожаловать в магазин.' : 'Добро пожаловать в историю!',
  });
  const keyboard = node('keyboardNode', 720, 260, {
    title: template === 'quiz' ? 'Ответы' : 'Выбор',
    buttons: [
      { id: uuidv4(), label: template === 'shop' ? 'Открыть магазин' : 'Продолжить', type: 'callback' },
      { id: uuidv4(), label: template === 'quiz' ? 'Другой ответ' : 'В меню', type: 'callback' },
    ],
  });
  return { nodes: [menu, continuation, greeting, keyboard], edges: [edge(menu, continuation), edge(greeting, keyboard)] };
}

// POST /api/bots/:id/media/:type — store uploaded content outside bot JSON
app.post('/api/bots/:id/media/:type', requireAuth, express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const botId = safeSegment(req.params.id);
    const folder = MEDIA_FOLDERS[req.params.type];
    if (!botId || botId !== req.params.id || !fs.existsSync(getBotPath(botId))) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    if (!folder) return res.status(400).json({ error: 'Unsupported media type' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Empty file' });
    }
    const validationError = validateUploadedMedia(req.params.type, req.body.length, req.get('content-type'));
    if (validationError) return res.status(400).json({ error: validationError });

    const originalName = decodeURIComponent(req.get('x-file-name') || 'file');
    const storedName = `${uuidv4()}-${safeFileName(originalName)}`;
    const targetDir = path.join(MEDIA_DIR, botId, folder);
    fs.mkdirSync(targetDir, { recursive: true });
    const storedPath = path.join(targetDir, storedName);
    fs.writeFileSync(storedPath, req.body);
    const duration = ['video', 'circle', 'voice', 'audio'].includes(req.params.type) ? probeDuration(storedPath) : null;
    if ((req.params.type === 'video' || req.params.type === 'circle') && duration === null) {
      fs.unlinkSync(storedPath);
      return res.status(400).json({ error: 'Не удалось прочитать видео. Загрузите корректный MP4-файл.' });
    }

    res.status(201).json({
      url: `/api/media/${botId}/${folder}/${storedName}`,
      fileName: originalName,
      size: req.body.length,
      duration,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(express.json({ limit: '10mb' }));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function botExists(id) {
  return fs.existsSync(getBotPath(id));
}

app.get('/api/health', asyncRoute(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, database: 'connected' });
}));

app.post('/api/auth/login', (req, res) => {
  const login = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  if (!checkLoginPassword(login, password)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = createAuthToken(login);
  setAuthCookie(req, res, token);
  res.json({ token, user: userPublic(getAuthUser(login)) || { login } });
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/profile', requireAuth, (req, res) => {
  res.json(userPublic(getAuthUser(req.user.login)));
});

app.put('/api/profile', requireAuth, (req, res) => {
  const users = ensureUserStore();
  const user = users[req.user.login];
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.avatar = String(req.body?.avatar || '').trim().slice(0, 2048);
  user.about = String(req.body?.about || '').trim().slice(0, 2000);
  user.updatedAt = new Date().toISOString();
  writeUsers(users);
  res.json(userPublic(user));
});

app.put('/api/profile/password', requireAuth, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const nextPassword = String(req.body?.newPassword || '');
  if (nextPassword.length < 6) return res.status(400).json({ error: 'Новый пароль должен быть не короче 6 символов' });
  if (!checkLoginPassword(req.user.login, currentPassword)) return res.status(403).json({ error: 'Текущий пароль неверный' });
  const users = ensureUserStore();
  const user = users[req.user.login];
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.passwordHash = hashPassword(nextPassword);
  user.updatedAt = new Date().toISOString();
  writeUsers(users);
  res.json({ ok: true });
});

app.get('/api/users', requireAuth, requireUserManager, (req, res) => {
  const users = ensureUserStore();
  res.json(Object.values(users).map(userPublic).sort((a, b) => a.login.localeCompare(b.login, 'ru')));
});

app.post('/api/users', requireAuth, requireUserManager, (req, res) => {
  const login = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(login)) return res.status(400).json({ error: 'Логин: 3-32 символа, латиница/цифры/._-' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  const users = ensureUserStore();
  if (users[login] || ENV_AUTH_USERS[login]) return res.status(409).json({ error: 'Пользователь уже существует' });
  const now = new Date().toISOString();
  users[login] = {
    login,
    role: req.body?.role === 'admin' ? 'admin' : 'user',
    passwordHash: hashPassword(password),
    avatar: String(req.body?.avatar || '').trim().slice(0, 2048),
    about: String(req.body?.about || '').trim().slice(0, 2000),
    createdAt: now,
    updatedAt: now,
  };
  writeUsers(users);
  res.status(201).json(userPublic(users[login]));
});

app.get('/api/users/:login/profile', requireAuth, (req, res) => {
  const user = getAuthUser(req.params.login);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(userPublic(user));
});

app.put('/api/users/:login', requireAuth, requireUserManager, (req, res) => {
  const users = ensureUserStore();
  const user = users[req.params.login];
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (req.params.login === 'admin' && req.body?.role && req.body.role !== 'admin') return res.status(400).json({ error: 'admin должен оставаться администратором' });
  user.role = req.body?.role === 'admin' ? 'admin' : 'user';
  user.avatar = String(req.body?.avatar ?? user.avatar ?? '').trim().slice(0, 2048);
  user.about = String(req.body?.about ?? user.about ?? '').trim().slice(0, 2000);
  if (String(req.body?.password || '').length >= 6) user.passwordHash = hashPassword(String(req.body.password));
  user.updatedAt = new Date().toISOString();
  writeUsers(users);
  res.json(userPublic(user));
});

app.delete('/api/users/:login', requireAuth, requireUserManager, (req, res) => {
  if (req.params.login === 'admin' || req.params.login === req.user.login) return res.status(400).json({ error: 'Нельзя удалить этого пользователя' });
  const users = ensureUserStore();
  if (!users[req.params.login]) return res.status(404).json({ error: 'Пользователь не найден' });
  delete users[req.params.login];
  writeUsers(users);
  res.json({ ok: true });
});

app.post('/api/telegram/webhook/:id/:secret', asyncRoute(async (req, res) => {
  const accepted = await telegramRuntime.handleWebhook(req.params.id, req.params.secret, req.body);
  res.status(accepted ? 200 : 404).json({ ok: accepted });
}));

// GET /api/bots — list all bots
app.use('/api', requireAuth);

// ── Bot access control ──────────────────────────────────────────────────────

const SUPERUSERS = new Set(['admin', 'SNR93']);
const ROLE_LEVEL = { denied: -1, viewer: 0, editor: 1, owner: 2 };

async function resolveUserBotRole(botId, userLogin) {
  if (SUPERUSERS.has(userLogin)) return 'owner';
  const roles = await adminStore.listRoles(botId);
  const specific = roles.find(r => r.user_key === userLogin);
  if (specific) return specific.role;
  const all = roles.find(r => r.user_key === '@all');
  if (all) return all.role;
  return 'viewer';
}

function requireBotRole(minRole) {
  return asyncRoute(async (req, res, next) => {
    const role = await resolveUserBotRole(req.params.id, req.user.login);
    if (ROLE_LEVEL[role] < ROLE_LEVEL[minRole]) {
      return res.status(403).json({ error: role === 'denied' ? 'Доступ запрещён' : 'Недостаточно прав' });
    }
    req.botRole = role;
    next();
  });
}

app.get('/api/telegram-backup', requireSnr93, (req, res) => {
  res.json(readTelegramBackupSettings());
});

app.put('/api/telegram-backup', requireSnr93, (req, res) => {
  res.json(saveTelegramBackupSettings({
    enabled: req.body?.enabled,
    token: req.body?.token,
    chatId: req.body?.chatId,
    scheduleTime: req.body?.scheduleTime,
  }));
});

app.post('/api/telegram-backup/send', requireSnr93, asyncRoute(async (req, res) => {
  if (telegramBackupBusy) return res.status(409).json({ error: 'Бэкап уже выполняется' });
  telegramBackupBusy = true;
  try {
    res.json(await sendTelegramBackup(readTelegramBackupSettings(), 'manual'));
  } finally {
    telegramBackupBusy = false;
  }
}));

app.post('/api/telegram-backup/restore', requireSnr93, express.raw({ type: '*/*', limit: '500mb' }), asyncRoute(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'Загрузите архив бэкапа' });
  const result = await restoreBotsMediaArchive(req.body);
  res.json({ ok: true, ...result });
}));

app.get('/api/bots', asyncRoute(async (req, res) => {
  const allBots = listBots();
  if (SUPERUSERS.has(req.user.login)) return res.json(allBots);
  const rolesResult = await pool.query(
    `SELECT bot_id, user_key, role FROM project_roles WHERE user_key = $1 OR user_key = '@all'`,
    [req.user.login]
  );
  const byBot = {};
  for (const r of rolesResult.rows) {
    if (!byBot[r.bot_id]) byBot[r.bot_id] = {};
    byBot[r.bot_id][r.user_key] = r.role;
  }
  res.json(allBots.filter(bot => {
    const botRoles = byBot[bot.id] || {};
    const effective = botRoles[req.user.login] || botRoles['@all'] || 'viewer';
    return effective !== 'denied';
  }));
}));

// POST /api/bots — create new bot
app.post('/api/bots', (req, res) => {
  try {
    const id = uuidv4();
    const now = new Date().toISOString();
    const name = normalizeBotName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Укажите название бота' });
    if (findBotByName(name)) return res.status(409).json({ error: `Бот с названием "${name}" уже существует` });
    const template = createBotTemplate('empty');
    const bot = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      createdBy: req.user.login,
      comment: sanitizeComment(req.body.comment),
      nodes: template.nodes,
      edges: template.edges,
      snapshots: [],
    };
    fs.writeFileSync(getBotPath(id), JSON.stringify(bot, null, 2));
    res.status(201).json(bot);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bots/:id — get bot
app.get('/api/bots/:id', requireBotRole('viewer'), (req, res) => {
  const p = getBotPath(req.params.id);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
});

// PUT /api/bots/:id — save bot
app.put('/api/bots/:id', requireBotRole('editor'), (req, res) => {
  try {
    const p = getBotPath(req.params.id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const requestedName = req.body.name === undefined ? existing.name : normalizeBotName(req.body.name);
    if (!requestedName) return res.status(400).json({ error: 'Укажите название бота' });
    if (findBotByName(requestedName, existing.id)) return res.status(409).json({ error: `Бот с названием "${requestedName}" уже существует` });
    const updated = {
      ...existing,
      ...req.body,
      id: existing.id,
      name: requestedName,
      createdAt: existing.createdAt || existing.updatedAt || new Date().toISOString(),
      createdBy: existing.createdBy || req.user.login,
      comment: req.body.comment === undefined ? existing.comment || '' : sanitizeComment(req.body.comment),
      updatedAt: new Date().toISOString(),
    };
    const validationErrors = validateScenario(updated, url => telegramRuntime.localMediaPath(url));
    if (validationErrors.length) return res.status(400).json({ error: validationErrors.join('\n') });

    // Auto-record node history for changed nodes
    try {
      const prevNodeMap = new Map((existing.nodes || []).map(n => [n.id, n]));
      const history = readNodeHistory(existing.id);
      const now = new Date().toISOString();
      const author = req.user?.login || 'unknown';
      let historyChanged = false;
      for (const node of (updated.nodes || [])) {
        const prev = prevNodeMap.get(node.id);
        const newData = stripNodeUiFields(node.data);
        const prevData = stripNodeUiFields(prev?.data);
        if (JSON.stringify(prevData) === JSON.stringify(newData)) continue;
        if (!history[node.id]) history[node.id] = [];
        history[node.id].push({ id: randomUUID(), ts: now, author, comment: '', data: newData });
        if (history[node.id].length > MAX_NODE_HISTORY) {
          history[node.id] = history[node.id].slice(-MAX_NODE_HISTORY);
        }
        historyChanged = true;
      }
      if (historyChanged) writeNodeHistory(existing.id, history);
    } catch (histErr) {
      console.error('Node history recording failed:', histErr.message);
    }

    fs.writeFileSync(p, JSON.stringify(updated, null, 2));
    telegramRuntime.refreshCommands(req.params.id).catch(error => console.error('Telegram commands refresh failed:', error.message));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bots/:id/history/node/:nodeId — get node history
app.get('/api/bots/:id/history/node/:nodeId', (req, res) => {
  try {
    const botId = safeSegment(req.params.id);
    if (!botId || !botExists(botId)) return res.status(404).json({ error: 'Not found' });
    const history = readNodeHistory(botId);
    const entries = (history[req.params.nodeId] || []).slice().reverse(); // newest first
    res.json(entries);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/bots/:id/history/node/:nodeId — add manual snapshot
app.post('/api/bots/:id/history/node/:nodeId', (req, res) => {
  try {
    const botId = safeSegment(req.params.id);
    if (!botId || !botExists(botId)) return res.status(404).json({ error: 'Not found' });
    const bot = JSON.parse(fs.readFileSync(getBotPath(botId), 'utf-8'));
    const node = (bot.nodes || []).find(n => n.id === req.params.nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const history = readNodeHistory(botId);
    if (!history[node.id]) history[node.id] = [];
    const entry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      author: req.user?.login || 'unknown',
      comment: String(req.body?.comment || '').slice(0, 500),
      data: stripNodeUiFields(node.data),
    };
    history[node.id].push(entry);
    if (history[node.id].length > MAX_NODE_HISTORY) history[node.id] = history[node.id].slice(-MAX_NODE_HISTORY);
    writeNodeHistory(botId, history);
    res.status(201).json(entry);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/bots/:id/history/node/:nodeId/:entryId/comment — update comment
app.put('/api/bots/:id/history/node/:nodeId/:entryId/comment', (req, res) => {
  try {
    const botId = safeSegment(req.params.id);
    if (!botId || !botExists(botId)) return res.status(404).json({ error: 'Not found' });
    const history = readNodeHistory(botId);
    const entry = (history[req.params.nodeId] || []).find(e => e.id === req.params.entryId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    entry.comment = String(req.body?.comment || '').slice(0, 500);
    writeNodeHistory(botId, history);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/bots/:id/history/node/:nodeId/:entryId — delete entry
app.delete('/api/bots/:id/history/node/:nodeId/:entryId', (req, res) => {
  try {
    const botId = safeSegment(req.params.id);
    if (!botId || !botExists(botId)) return res.status(404).json({ error: 'Not found' });
    const history = readNodeHistory(botId);
    if (history[req.params.nodeId]) {
      history[req.params.nodeId] = history[req.params.nodeId].filter(e => e.id !== req.params.entryId);
      writeNodeHistory(botId, history);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/bots/:id/comment', (req, res) => {
  try {
    const p = getBotPath(req.params.id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const updated = { ...existing, comment: sanitizeComment(req.body.comment), updatedAt: new Date().toISOString() };
    fs.writeFileSync(p, JSON.stringify(updated, null, 2));
    res.json({
      id: updated.id,
      name: updated.name,
      createdAt: updated.createdAt || updated.updatedAt,
      updatedAt: updated.updatedAt,
      createdBy: updated.createdBy || 'unknown',
      comment: updated.comment || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin API: persistent player data stored in PostgreSQL.
app.get('/api/bots/:id/admin/players', asyncRoute(async (req, res) => {
  if (!botExists(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  res.json(await playerStore.listPlayers(req.params.id, req.query.q || ''));
}));

app.post('/api/bots/:id/admin/players', asyncRoute(async (req, res) => {
  if (!botExists(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  if (!req.body.playerId) return res.status(400).json({ error: 'playerId is required' });
  const player = await playerStore.ensurePlayer(req.params.id, {
    id: req.body.playerId,
    username: req.body.username,
    first_name: req.body.firstName,
    last_name: req.body.lastName,
  }, req.body.chatId || req.body.playerId);
  res.status(201).json(player);
}));

app.get('/api/bots/:id/admin/players/:playerId', asyncRoute(async (req, res) => {
  if (!botExists(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  const player = await playerStore.loadPlayer(req.params.id, req.params.playerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json(player);
}));

app.put('/api/bots/:id/admin/players/:playerId/variables/:name', asyncRoute(async (req, res) => {
  if (!botExists(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  const type = req.body.type || 'boolean';
  if (!['boolean', 'number', 'text'].includes(type)) return res.status(400).json({ error: 'Unsupported variable type' });
  await playerStore.setVariable(req.params.id, req.params.playerId, req.params.name, type, req.body.value);
  res.json(await playerStore.loadPlayer(req.params.id, req.params.playerId));
}));

app.delete('/api/bots/:id/admin/players/:playerId/variables/:name', asyncRoute(async (req, res) => {
  await playerStore.deleteVariable(req.params.id, req.params.playerId, req.params.name);
  res.json(await playerStore.loadPlayer(req.params.id, req.params.playerId));
}));

app.put('/api/bots/:id/admin/players/:playerId/inventory/:itemKey', asyncRoute(async (req, res) => {
  if (!botExists(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  await playerStore.setInventoryItem(req.params.id, req.params.playerId, req.params.itemKey, req.body.quantity, req.body.metadata || {});
  res.json(await playerStore.loadPlayer(req.params.id, req.params.playerId));
}));

app.delete('/api/bots/:id/admin/players/:playerId/inventory/:itemKey', asyncRoute(async (req, res) => {
  await playerStore.deleteInventoryItem(req.params.id, req.params.playerId, req.params.itemKey);
  res.json(await playerStore.loadPlayer(req.params.id, req.params.playerId));
}));

app.put('/api/bots/:id/admin/players/:playerId/relations/:characterKey', asyncRoute(async (req, res) => {
  await playerStore.setRelation(req.params.id, req.params.playerId, req.params.characterKey, req.body.value, req.body.metadata || {});
  res.json(await playerStore.loadPlayer(req.params.id, req.params.playerId));
}));

app.delete('/api/bots/:id/admin/players/:playerId/relations/:characterKey', asyncRoute(async (req, res) => {
  await playerStore.deleteRelation(req.params.id, req.params.playerId, req.params.characterKey);
  res.json(await playerStore.loadPlayer(req.params.id, req.params.playerId));
}));

app.put('/api/bots/:id/admin/players/:playerId/achievements/:achievementKey', asyncRoute(async (req, res) => {
  await playerStore.unlockAchievement(req.params.id, req.params.playerId, req.params.achievementKey, req.body.metadata || {});
  res.json(await playerStore.loadPlayer(req.params.id, req.params.playerId));
}));

app.delete('/api/bots/:id/admin/players/:playerId/achievements/:achievementKey', asyncRoute(async (req, res) => {
  await playerStore.deleteAchievement(req.params.id, req.params.playerId, req.params.achievementKey);
  res.json(await playerStore.loadPlayer(req.params.id, req.params.playerId));
}));

app.post('/api/bots/:id/admin/players/:playerId/reset', asyncRoute(async (req, res) => {
  await playerStore.resetPlayer(req.params.id, req.params.playerId);
  res.json(await playerStore.loadPlayer(req.params.id, req.params.playerId));
}));

app.delete('/api/bots/:id/admin/players/:playerId', asyncRoute(async (req, res) => {
  const player = await playerStore.deletePlayer(req.params.id, req.params.playerId);
  await telegramRuntime.removePlayerSession(req.params.id, player?.chat_id);
  res.json({ ok: true });
}));

app.get('/api/bots/:id/admin/promocodes', asyncRoute(async (req, res) => {
  res.json(await adminStore.listPromocodes(req.params.id));
}));

app.put('/api/bots/:id/admin/promocodes/:code', asyncRoute(async (req, res) => {
  res.json(await adminStore.savePromocode(req.params.id, req.params.code, req.body));
}));

app.delete('/api/bots/:id/admin/promocodes/:code', asyncRoute(async (req, res) => {
  await adminStore.deletePromocode(req.params.id, req.params.code);
  res.json({ ok: true });
}));

app.get('/api/bots/:id/admin/analytics', asyncRoute(async (req, res) => {
  res.json(await adminStore.getAnalytics(req.params.id));
}));

app.get('/api/bots/:id/admin/versions', asyncRoute(async (req, res) => {
  res.json(await adminStore.listVersions(req.params.id));
}));

app.post('/api/bots/:id/admin/versions', asyncRoute(async (req, res) => {
  const bot = JSON.parse(fs.readFileSync(getBotPath(req.params.id), 'utf-8'));
  res.status(201).json(await adminStore.createVersion(req.params.id, bot));
}));

app.post('/api/bots/:id/admin/versions/:versionId/publish', asyncRoute(async (req, res) => {
  res.json(await adminStore.publishVersion(req.params.id, req.params.versionId, req.body?.rolloutPercentage));
}));

app.get('/api/bots/:id/admin/backups', asyncRoute(async (req, res) => {
  res.json(await adminStore.listBackups(req.params.id));
}));

app.post('/api/bots/:id/admin/backups', asyncRoute(async (req, res) => {
  const bot = JSON.parse(fs.readFileSync(getBotPath(req.params.id), 'utf-8'));
  res.status(201).json(await adminStore.createBackup(req.params.id, req.body.type || 'manual', { scenario: bot }));
}));

app.post('/api/bots/:id/admin/backups/:backupId/restore', asyncRoute(async (req, res) => {
  const backup = await adminStore.getBackup(req.params.id, req.params.backupId);
  if (!backup?.payload?.scenario) return res.status(404).json({ error: 'Backup not found' });
  const scenario = { ...backup.payload.scenario, id: req.params.id, updatedAt: new Date().toISOString() };
  fs.writeFileSync(getBotPath(req.params.id), JSON.stringify(scenario, null, 2));
  res.json({ ok: true });
}));

app.get('/api/bots/:id/admin/jobs', asyncRoute(async (req, res) => {
  res.json(await adminStore.listJobs(req.params.id));
}));

app.post('/api/bots/:id/admin/jobs', asyncRoute(async (req, res) => {
  if (req.body.type === 'broadcast') assertText(req.body.payload?.text, TELEGRAM_LIMITS.messageText, 'Текст рассылки');
  res.status(201).json(await adminStore.createJob(req.params.id, req.body.type, req.body.runAt, req.body.payload));
}));

app.post('/api/bots/:id/admin/broadcast-count', asyncRoute(async (req, res) => {
  const { filters = [], inactiveDays = 0 } = req.body;
  const { query, params } = buildBroadcastQuery(req.params.id, [], filters, +inactiveDays || 0);
  const result = await pool.query(`SELECT COUNT(*) AS count FROM (${query}) sub`, params);
  res.json({ count: +result.rows[0].count });
}));

app.get('/api/bots/:id/admin/products', asyncRoute(async (req, res) => {
  res.json(await adminStore.listProducts(req.params.id));
}));

app.put('/api/bots/:id/admin/products/:productKey', asyncRoute(async (req, res) => {
  assertText(req.body.title, TELEGRAM_LIMITS.invoiceTitle, 'Название товара');
  assertText(req.body.description || req.body.title, TELEGRAM_LIMITS.invoiceDescription, 'Описание товара');
  res.json(await adminStore.saveProduct(req.params.id, req.params.productKey, req.body));
}));

app.delete('/api/bots/:id/admin/products/:productKey', asyncRoute(async (req, res) => {
  await adminStore.deleteProduct(req.params.id, req.params.productKey);
  res.json({ ok: true });
}));

// Global (bot-level) variables
app.get('/api/bots/:id/admin/globals', asyncRoute(async (req, res) => {
  if (!botExists(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  res.json(await playerStore.listBotVariables(req.params.id));
}));

app.put('/api/bots/:id/admin/globals/:name', asyncRoute(async (req, res) => {
  if (!botExists(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  const type = req.body.type || 'number';
  if (!['boolean', 'number', 'text'].includes(type)) return res.status(400).json({ error: 'Unsupported type' });
  await playerStore.setBotVariable(req.params.id, req.params.name, type, req.body.value);
  res.json(await playerStore.listBotVariables(req.params.id));
}));

app.delete('/api/bots/:id/admin/globals/:name', asyncRoute(async (req, res) => {
  await playerStore.deleteBotVariable(req.params.id, req.params.name);
  res.json({ ok: true });
}));

app.get('/api/bots/:id/my-role', asyncRoute(async (req, res) => {
  res.json({ role: await resolveUserBotRole(req.params.id, req.user.login) });
}));

app.get('/api/bots/:id/admin/roles', asyncRoute(async (req, res) => {
  const roles = await adminStore.listRoles(req.params.id);
  const myRole = await resolveUserBotRole(req.params.id, req.user.login);
  res.json({ roles, myRole });
}));

app.put('/api/bots/:id/admin/roles/:userKey', requireBotRole('owner'), asyncRoute(async (req, res) => {
  const userKey = decodeURIComponent(req.params.userKey);
  res.json(await adminStore.saveRole(req.params.id, userKey, req.body.role, req.body.comment || ''));
}));

app.delete('/api/bots/:id/admin/roles/:userKey', requireBotRole('owner'), asyncRoute(async (req, res) => {
  await adminStore.deleteRole(req.params.id, decodeURIComponent(req.params.userKey));
  res.json({ ok: true });
}));

// GET /api/bots/:id/telegram — Telegram runtime status and recent logs
app.get('/api/bots/:id/telegram', (req, res) => {
  const p = getBotPath(req.params.id);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.json(telegramRuntime.status(req.params.id));
});

// POST /api/bots/:id/telegram/start — validate token and start long polling
app.post('/api/bots/:id/telegram/start', async (req, res) => {
  try {
    const p = getBotPath(req.params.id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
    res.json(await telegramRuntime.start(req.params.id, req.body?.token));
  } catch (e) {
    res.status(e.code === 'TOKEN_REQUIRED' ? 400 : 502).json({ error: e.message, code: e.code });
  }
});

// POST /api/bots/:id/telegram/stop — stop long polling
app.post('/api/bots/:id/telegram/stop', asyncRoute(async (req, res) => {
  const p = getBotPath(req.params.id);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.json(await telegramRuntime.stop(req.params.id));
}));

// DELETE /api/bots/:id — delete bot
app.delete('/api/bots/:id', requireBotRole('owner'), (req, res) => {
  const p = getBotPath(req.params.id);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  telegramRuntime.remove(req.params.id);
  fs.unlinkSync(p);
  const historyPath = getNodeHistoryPath(req.params.id);
  if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);
  const botId = safeSegment(req.params.id);
  if (botId && botId === req.params.id) {
    const mediaPath = path.join(MEDIA_DIR, botId);
    if (fs.existsSync(mediaPath)) fs.rmSync(mediaPath, { recursive: true, force: true });
  }
  res.json({ ok: true });
});

// GET /api/bots/:id/download — download JSON
app.get('/api/bots/:id/download', (req, res) => {
  const p = getBotPath(req.params.id);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  const bot = JSON.parse(fs.readFileSync(p, 'utf-8'));
  res.setHeader('Content-Disposition', `attachment; filename="${bot.name}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(bot, null, 2));
});

app.use((error, req, res, next) => {
  console.error(error);
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Файл слишком большой для Telegram: максимум 50 MB.' });
  }
  res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
});

function buildBroadcastQuery(botId, playerIds = [], filters = [], inactiveDays = 0) {
  let query = `SELECT p.chat_id FROM players p WHERE p.bot_id = $1 AND p.chat_id IS NOT NULL AND ($2::text[] = '{}' OR p.telegram_user_id = ANY($2::text[]))`;
  const params = [botId, playerIds];
  for (const filter of filters) {
    const source = filter.source || 'variable';
    const key = filter.key;
    const safeOp = ['=', '!=', '>', '<', '>=', '<='].includes(filter.operator) ? filter.operator : '=';
    if (source === 'variable' && key) {
      params.push(key, String(filter.value ?? ''));
      query += ` AND EXISTS (SELECT 1 FROM player_variables v WHERE v.bot_id = p.bot_id AND v.telegram_user_id = p.telegram_user_id AND v.var_name = $${params.length - 1} AND (v.value #>> '{}') ${safeOp} $${params.length})`;
    } else if (source === 'inventory' && key) {
      params.push(key, Number(filter.value) || 0);
      query += ` AND EXISTS (SELECT 1 FROM player_inventory i WHERE i.bot_id = p.bot_id AND i.telegram_user_id = p.telegram_user_id AND i.item_key = $${params.length - 1} AND i.quantity ${safeOp} $${params.length})`;
    } else if (source === 'achievement' && key) {
      params.push(key);
      query += ` AND ${filter.operator === 'not_unlocked' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM player_achievements a WHERE a.bot_id = p.bot_id AND a.telegram_user_id = p.telegram_user_id AND a.achievement_key = $${params.length})`;
    }
  }
  if (+inactiveDays > 0) {
    params.push(+inactiveDays);
    query += ` AND p.last_seen_at < NOW() - ($${params.length} * INTERVAL '1 day')`;
  }
  return { query, params };
}

initDatabase()
  .then(async () => {
    await telegramRuntime.startConfigured();
    startJobWorker({
      broadcast: async job => {
        const filters = job.payload.filters || (job.payload.filter ? [job.payload.filter] : []);
        const { query, params } = buildBroadcastQuery(job.bot_id, job.payload.playerIds || [], filters, job.payload.inactiveDays || 0);
        const result = await pool.query(query, params);
        const chatIds = result.rows.map(r => r.chat_id);
        await pool.query(`UPDATE scheduled_jobs SET payload = payload || $2::jsonb, updated_at = NOW() WHERE id = $1`, [job.id, JSON.stringify({ total_count: chatIds.length })]);
        const { sent, failed } = await telegramRuntime.broadcast(job.bot_id, chatIds, job.payload.text || '');
        await pool.query(`UPDATE scheduled_jobs SET payload = payload || $2::jsonb, updated_at = NOW() WHERE id = $1`, [job.id, JSON.stringify({ sent_count: sent, failed_count: failed, total_count: chatIds.length })]);
      },
      scenario_resume: async job => telegramRuntime.resumeScenario(job.bot_id, job.payload),
      keyboard_timeout: async job => telegramRuntime.handleKeyboardTimeout(job.bot_id, job.payload),
    });
    setInterval(() => {
      runTelegramBackupSchedule().catch(error => console.error('Telegram backup schedule failed:', error));
    }, 30 * 1000);
    app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
  })
  .catch(error => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
