/**
 * Codex developer notes:
 * Исполнитель Telegram-сценариев: принимает входящие апдейты, проходит по графу нод, отправляет сообщения и сохраняет состояние игрока.
 * Это самый чувствительный backend-модуль: ошибки здесь напрямую ломают уже запущенных ботов и активные игровые сессии.
 * Комментарии в файле помогают читать поток выполнения: вход Telegram -> выбор ноды -> side effects -> сохранение сессии.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const playerStore = require('./playerStore');
const adminStore = require('./adminStore');
const { TELEGRAM_LIMITS, assertText, assertVideoNoteDuration } = require('./telegramLimits');
const {
  getNext, interpolate, branchMatches, evaluateButtonCondition,
  inventoryMap, relationMap, commandNames, parseCommand, setCommandArgs, findStoryRoot,
  telegramVariables,
} = require('./graphUtils');
const { RateLimiter, resolveLocalPath, apiRequest, apiUpload, apiSendMediaGroup } = require('./telegramApi');
const { createSessionStore } = require('./sessionStore');
const { pickRandomBranch } = require('./randomUtils');

const DATA_DIR = path.join(__dirname, 'data');
const BOTS_DIR = path.join(DATA_DIR, 'bots');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const TELEGRAM_DIR = path.join(DATA_DIR, 'telegram');
const runtimes = new Map();

fs.mkdirSync(TELEGRAM_DIR, { recursive: true });

// Небольшие файловые helper'ы держим рядом с runtime, потому что они описывают
// production-раскладку данных: JSON сценариев, локальные медиа и Telegram-конфиги
// лежат в backend/data и переживают пересборку Docker-контейнера.
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function getBotPath(botId)    { return path.join(BOTS_DIR, `${botId}.json`); }
function getConfigPath(botId) { return path.join(TELEGRAM_DIR, `${botId}.json`); }
function localMediaPath(url)  { return resolveLocalPath(url, MEDIA_DIR); }
function readBot(botId)       { return JSON.parse(fs.readFileSync(getBotPath(botId), 'utf-8')); }
function readBotSafe(botId) {
  try {
    const bot = readBot(botId);
    return bot && Array.isArray(bot.nodes) && Array.isArray(bot.edges) ? bot : null;
  } catch {
    return null;
  }
}
function delaySeconds(data = {}) {
  const amount = Math.max(0, +(data.amount ?? data.seconds ?? 3) || 0);
  const multipliers = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
  return amount * (multipliers[data.unit] || 1);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TELEGRAM_FORMAT_TAG = /<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler)\s*>|<a\s+href=(?:"[^"]*"|'[^']*')\s*>|<\/a>/gi;

function stripLoreTags(text) {
  // Remove <a data-lore-title="...">word</a> — replace with just the inner text
  return String(text || '').replace(/<a\s+data-lore-title="[^"]*">([\s\S]*?)<\/a>/gi, '$1');
}

// Telegram допускает ограниченный набор HTML-тегов. Здесь мы экранируем весь
// пользовательский текст, но сохраняем только разрешённую разметку. Это защищает
// от случайно сломанного HTML и одновременно оставляет автору сценария жирный,
// курсив, ссылки, spoiler и code/pre.
function telegramTextPayload(text) {
  const raw = stripLoreTags(String(text ?? ''));
  if (!TELEGRAM_FORMAT_TAG.test(raw)) return { text: raw };
  TELEGRAM_FORMAT_TAG.lastIndex = 0;
  let cursor = 0;
  let html = '';
  let match;
  while ((match = TELEGRAM_FORMAT_TAG.exec(raw))) {
    html += escapeHtml(raw.slice(cursor, match.index));
    html += match[0];
    cursor = match.index + match[0].length;
  }
  html += escapeHtml(raw.slice(cursor));
  return { text: html, parse_mode: 'HTML' };
}

function parseRewardValue(rawValue, type) {
  if (type === 'number') return Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0;
  if (type === 'boolean') return rawValue === true || rawValue === 'true';
  return String(rawValue ?? '');
}

function codexVariableName(data = {}) {
  const key = String(data.codexKey || data.key || '').trim().replace(/^codex\./i, '');
  return key ? `codex.${key}` : '';
}

function pollOptions(data = {}) {
  return (data.options || []).map((option, index) => (
    typeof option === 'string'
      ? { id: `option-${index}`, label: option }
      : { id: option.id || `option-${index}`, label: option.label ?? option.text ?? '' }
  )).filter(option => String(option.label || '').trim());
}

function readConfig(botId) {
  const p = getConfigPath(botId);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
function writeConfig(botId, config) {
  fs.writeFileSync(getConfigPath(botId), JSON.stringify(config, null, 2));
}

function extractByPath(obj, dotPath) {
  if (!dotPath) return obj;
  return dotPath.split('.').reduce((acc, key) => acc?.[key], obj);
}

// Формулы выполняются через Function только после жёсткой нормализации:
// плейсхолдеры заменяются числами, проценты переводятся в арифметику, затем
// регулярка запрещает любые символы кроме цифр, пробелов и математических знаков.
// Это компромисс между удобством автора сценария и безопасностью runtime.
function evaluateFormulaExpression(expression, vars) {
  const withValues = String(expression || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
    const variable = vars?.[name.trim()];
    if (!variable || variable.type !== 'number') throw new Error(`Формула: плейсхолдер «${name.trim()}» не является числом.`);
    return String(Number(variable.value) || 0);
  });
  // Multiplicative %: *50% → *(50/100), /50% → /(50/100)
  let normalized = withValues.replace(/([*/])\s*(\d+(?:[.,]\d+)?)\s*%/g,
    (_, op, n) => `${op}(${n.replace(',', '.')}/100)`);
  // Additive %: -50% → *(1-50/100)  i.e. "subtract 50% of the current value"
  //             +50% → *(1+50/100)  i.e. "add 50% of the current value"
  normalized = normalized.replace(/([+\-])\s*(\d+(?:[.,]\d+)?)\s*%/g,
    (_, op, n) => `*(1${op}${n.replace(',', '.')}/100)`);
  if (!/^[\d+\-*/().\s]+$/.test(normalized)) throw new Error('Формула содержит недопустимые символы.');
  const result = Function(`"use strict"; return (${normalized});`)();
  if (!Number.isFinite(result)) throw new Error('Формула вернула нечисловое значение.');
  return Number.isInteger(result) ? result : Math.ceil(result);
}

// Экземпляр TelegramRuntime обслуживает ровно одного Telegram-бота. Он хранит
// token, offset long polling, rate limiter, последние логи и Redis-backed sessions.
// Глобальная Map runtimes ниже нужна, чтобы HTTP API мог управлять каждым ботом
// независимо и не останавливать остальные сценарии.
class TelegramRuntime {
  constructor(botId, token, config = {}) {
    this.botId = botId;
    this.token = token;
    this.running = false;
    this.offset = 0;
    this.logs = [];
    this.sessions = createSessionStore(botId);
    this.rateLimiter = new RateLimiter(25);
    this.botInfo = null;
    this.mode = 'polling';
    this.webhookSecret = config.webhookSecret || randomUUID();
    this.pollWaits = new Map();
  }

  addLog(level, message) {
    this.logs.push({ timestamp: new Date().toISOString(), level, message });
    if (this.logs.length > 300) this.logs.shift();
  }

  status() {
    return { running: this.running, tokenConfigured: true, token: this.token, botUsername: this.botInfo?.username || null, mode: this.mode, logs: this.logs };
  }

  botForSession(session) {
    const bot = session?.bot && Array.isArray(session.bot.nodes) && Array.isArray(session.bot.edges)
      ? session.bot
      : readBotSafe(this.botId);
    if (session && bot && session.bot !== bot) session.bot = bot;
    return bot;
  }

  // ── Telegram API ───────────────────────────────────────────────────

  // Все исходящие запросы проходят через этот метод: тут централизованы лимиты
  // текста Telegram, rate limiter и единая обработка Bot API. Если добавить новый
  // способ отправки, лучше вести его через request/upload/sendMediaGroup.
  async request(method, payload = {}) {
    if (method === 'sendMessage' || method === 'editMessageText') assertText(payload.text, TELEGRAM_LIMITS.messageText, 'Текст сообщения');
    if (method === 'sendPoll') {
      assertText(payload.question, TELEGRAM_LIMITS.pollQuestion, 'Вопрос опроса');
      (payload.options || []).forEach(option => assertText(option, TELEGRAM_LIMITS.pollOption, 'Вариант опроса'));
    }
    if (method === 'setMyCommands') (payload.commands || []).forEach(c => assertText(c.description, TELEGRAM_LIMITS.commandDescription, `Описание /${c.command}`));
    if (method === 'sendInvoice') {
      assertText(payload.title, TELEGRAM_LIMITS.invoiceTitle, 'Название товара');
      assertText(payload.description, TELEGRAM_LIMITS.invoiceDescription, 'Описание товара');
    }
    return apiRequest(this.token, this.rateLimiter, method, payload);
  }

  async upload(method, field, chatId, filePath, data = {}) {
    return apiUpload(this.token, this.rateLimiter, method, field, chatId, filePath, data);
  }

  async sendMediaGroup(chatId, items) {
    return apiSendMediaGroup(this.token, this.rateLimiter, chatId, items, MEDIA_DIR);
  }

  interp(text, vars, chatId, nodeId) {
    const missing = [];
    const result = interpolate(text, vars, k => missing.push(k));
    if (missing.length) this.addLog('warn', `Чат ${chatId}${nodeId ? ` нода ${nodeId}` : ''}: переменные не найдены — ${missing.join(', ')}`);
    return result;
  }

  templateVars(session) {
    const dynamic = {};
    for (const [itemKey, quantity] of Object.entries(session.inventory || {})) {
      dynamic[`inventory.${itemKey}`] = { type: 'text', value: itemKey };
      dynamic[`inventory.my.${itemKey}`] = { type: 'text', value: `${itemKey} x${quantity}` };
      dynamic[`inventory.my.amount.${itemKey}`] = { type: 'number', value: quantity };
    }
    const reputationStatusMap = {};
    for (const node of session.bot?.nodes || []) {
      if (node.type !== 'reputationStatusNode') continue;
      for (const entry of node.data?.entries || []) {
        const rKey = (entry.reputationType && entry.reputationTarget)
          ? `${entry.reputationType}.${entry.reputationTarget}` : '';
        if (!rKey || !entry.levels?.length) continue;
        if (!reputationStatusMap[rKey]) reputationStatusMap[rKey] = entry.levels;
      }
    }
    for (const [relKey, value] of Object.entries(session.relations || {})) {
      dynamic[`reputation.${relKey}`] = { type: 'number', value };
      const levels = reputationStatusMap[relKey] || [];
      const match = levels.find(l => value >= (l.min ?? -Infinity) && value <= (l.max ?? Infinity));
      dynamic[`reputation.status.${relKey}`] = { type: 'text', value: match?.label ?? '' };
    }
    for (const [relKey, levels] of Object.entries(reputationStatusMap)) {
      if (dynamic[`reputation.status.${relKey}`]) continue;
      const value = session.relations?.[relKey] ?? 0;
      const match = levels.find(l => value >= (l.min ?? -Infinity) && value <= (l.max ?? Infinity));
      dynamic[`reputation.${relKey}`] = { type: 'number', value };
      dynamic[`reputation.status.${relKey}`] = { type: 'text', value: match?.label ?? '' };
    }
    for (const achievementKey of session.achievementList || []) {
      const meta = session.achievementMeta?.[achievementKey] || {};
      const title = meta.title || achievementKey;
      dynamic[`achievement.${achievementKey}`] = { type: 'text', value: meta.imageUrl ? `${title}\n${meta.imageUrl}` : title };
    }
    const achievementKeys = new Set((session.bot?.nodes || [])
      .filter(item => item.type === 'achievementNode' && item.data?.achievementKey)
      .map(item => item.data.achievementKey));
    dynamic['achievements.unlocked'] = { type: 'number', value: (session.achievementList || []).filter(key => achievementKeys.has(key)).length };
    dynamic['achievements.total'] = { type: 'number', value: achievementKeys.size };
    const unlockedTitles = [];
    for (const node of session.bot?.nodes || []) {
      if (node.type === 'achievementNode' && node.data?.achievementKey) {
        const key = node.data.achievementKey;
        const title = node.data.title || key;
        dynamic[`achievements.text.${key}`] = { type: 'text', value: title };
        if ((session.achievementList || []).includes(key)) unlockedTitles.push(title);
      }
    }
    dynamic['achievements.list'] = { type: 'text', value: unlockedTitles.join('\n') };
    for (const node of session.bot?.nodes || []) {
      if (node.type !== 'codexNode') continue;
      const entries = node.data.entries?.length > 0
        ? node.data.entries
        : node.data.codexKey ? [{ codexKey: node.data.codexKey, text: node.data.text }] : [];
      for (const entry of entries) {
        const name = codexVariableName(entry);
        if (!name) continue;
        const varEntry = session.vars?.[name];
        dynamic[name] = {
          type: 'text',
          value: varEntry?.type === 'text' ? String(varEntry.value || '') : (varEntry?.value ? String(entry.text || '') : ''),
        };
      }
    }
    return { ...(session.globalVars || {}), ...(session.vars || {}), ...(session.telegramVars || {}), ...dynamic };
  }

  // ── Commands ────────────────────────────────────────────────────────

  async refreshCommands() {
    if (!this.running) return;
    const bot = readBotSafe(this.botId);
    if (!bot) return;
    const commands = [{ command: 'start', description: bot.nodes.some(n => n.type === 'menuNode') ? 'Открыть главное меню' : 'Начать игру' }];
    if (bot.nodes.some(n => n.type === 'settingsNode')) commands.push({ command: 'settings', description: 'Настройки' });
    const seen = new Set(commands.map(c => c.command));
    for (const node of bot.nodes.filter(n => n.type === 'customCommandNode' && n.data.showInMenu !== false)) {
      const cmd = commandNames(node)[0];
      if (!cmd || seen.has(cmd) || commands.length >= 100) continue;
      seen.add(cmd);
      commands.push({ command: cmd, description: String(node.data.description || node.data.title || 'Команда').slice(0, 256) });
    }
    await this.request('setMyCommands', { commands });
  }

  // ── Session ────────────────────────────────────────────────────────

  async createSession(message, chatId) {
    const draftBot = readBotSafe(this.botId);
    let player = await playerStore.ensurePlayer(this.botId, message?.from || { id: chatId }, chatId);
    const bot = await adminStore.selectScenarioForPlayer(this.botId, player.telegram_user_id) || draftBot;
    if (!bot) throw new Error(`Bot ${this.botId} scenario is not available`);
    player = await playerStore.ensurePlayer(this.botId, message?.from || { id: chatId }, chatId);
    const storyRoot = findStoryRoot(bot);
    const globalVars = await playerStore.loadBotVariables(this.botId);
    const session = {
      playerId: player.telegram_user_id,
      vars: player.variables,
      telegramVars: telegramVariables(player, chatId),
      inventory: inventoryMap(player.inventory),
      relations: relationMap(player.relations),
      achievementList: (player.achievements || []).map(a => a.achievement_key),
      achievementMeta: Object.fromEntries((player.achievements || []).map(a => [a.achievement_key, a.metadata || {}])),
      globalVars,
      loopCounters: {},
      waiting: null,
      backgroundWaiting: null,
      callStack: [],
      storyResumeNodeId: player.current_node_id || null,
      bot,
    };
    this.sessions.set(chatId, session);
    return { player, session };
  }

  async openTransient(chatId, nodeId) {
    const session = this.sessions.has(chatId) ? (await this.sessions.get(chatId)) : null;
    if (!session || !nodeId) return;
    if (session.waiting && !session.waiting.transient && !session.backgroundWaiting) session.backgroundWaiting = session.waiting;
    session.waiting = null;
    await this.execute(chatId, nodeId, { transient: true });
  }

  restoreTransient(session) {
    session.waiting = session.backgroundWaiting || null;
    session.backgroundWaiting = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  // При старте runtime сначала проверяет токен через getMe, затем выбирает режим:
  // webhook при наличии PUBLIC_BASE_URL или long polling для локального/закрытого
  // сервера. drop_pending_updates=false нужен, чтобы не терять Telegram-события
  // во время короткого рестарта backend.
  async start() {
    this.botInfo = await this.request('getMe');
    this.running = true;
    await this.refreshCommands();
    this.addLog('info', `Запущен @${this.botInfo.username || this.botInfo.first_name}`);
    const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    if (publicBaseUrl) {
      this.mode = 'webhook';
      await this.request('setWebhook', { url: `${publicBaseUrl}/api/telegram/webhook/${this.botId}/${this.webhookSecret}`, allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'poll_answer'] });
      this.addLog('info', 'Webhook подключен');
    } else {
      await this.request('deleteWebhook', { drop_pending_updates: false });
      this.poll().catch(e => { this.addLog('error', `Polling: ${e.message}`); this.running = false; });
    }
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    if (this.mode === 'webhook') await this.request('deleteWebhook', { drop_pending_updates: false });
    this.addLog('info', 'Остановлен');
  }

  async poll() {
    while (this.running) {
      try {
        const updates = await this.request('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'poll_answer'] });
        for (const update of updates) { this.offset = update.update_id + 1; await this.handleUpdate(update); }
      } catch (e) {
        if (!this.running) break;
        this.addLog('error', `Polling: ${e.message}`);
        await sleep(2000);
      }
    }
  }

  // ── Update handling ────────────────────────────────────────────────

  // Главный вход для Telegram update. Порядок веток важен:
  // pre_checkout_query и callback_query обрабатываются до обычных сообщений,
  // /start создаёт сессию, команды меню открываются transient-ветками, а ввод
  // текста/промокода продолжает ранее поставленное ожидание.
  async handleUpdate(update) {
    try {
      if (update.pre_checkout_query) { await this.request('answerPreCheckoutQuery', { pre_checkout_query_id: update.pre_checkout_query.id, ok: true }); return; }
      if (update.poll_answer) { await this.handlePollAnswer(update.poll_answer); return; }
      if (update.callback_query) { await this.handleCallback(update.callback_query); return; }

      const message = update.message;
      const chatId  = message?.chat?.id;
      const text    = message?.text || '';
      if (!chatId) return;

      if (!this.sessions.has(chatId)) await this.sessions.get(chatId);

      const incomingCommand = parseCommand(text);

      if (incomingCommand?.name === 'start') {
        const { player, session } = await this.createSession(message, chatId);
        const referrerId = incomingCommand.args.startsWith('ref_') ? incomingCommand.args.slice(4) : '';
        if (referrerId) await playerStore.setReferrer(this.botId, player.telegram_user_id, referrerId);
        const menuNode = session.bot.nodes.find(n => n.type === 'menuNode');
        await playerStore.recordEvent(this.botId, player.telegram_user_id, 'scenario_start', session.storyResumeNodeId, { resumed: !!player.current_node_id, menu: !!menuNode });
        this.addLog('info', `Чат ${chatId}: /start`);
        if (menuNode) await this.openTransient(chatId, menuNode.id);
        else await this.execute(chatId, session.storyResumeNodeId || findStoryRoot(session.bot)?.id || null);
        await this.sessions.persist(chatId);
        return;
      }

      let session = await this.sessions.get(chatId);

      if (incomingCommand?.name === 'menu') {
        if (!session) ({ session } = await this.createSession(message, chatId));
        const entryNode = session.bot.nodes.find(n => n.type === 'menuNode');
        if (entryNode) { await playerStore.recordEvent(this.botId, session.playerId, 'command_menu_open', entryNode.id, { command: 'menu' }); await this.openTransient(chatId, entryNode.id); }
        else await this.request('sendMessage', { chat_id: chatId, text: 'Главное меню не добавлено.' });
        await this.sessions.persist(chatId);
        return;
      }

      if (incomingCommand?.name === 'settings') {
        if (!session) ({ session } = await this.createSession(message, chatId));
        const entryNode = session.bot.nodes.find(n => n.type === 'settingsNode');
        if (entryNode) { await playerStore.recordEvent(this.botId, session.playerId, 'command_menu_open', entryNode.id, { command: 'settings' }); await this.openTransient(chatId, entryNode.id); }
        else await this.request('sendMessage', { chat_id: chatId, text: 'Настройки не добавлены.' });
        await this.sessions.persist(chatId);
        return;
      }

      const parsedCommand = incomingCommand;
      const commandBot = this.botForSession(session);
      const customCommandNode = parsedCommand && commandBot?.nodes.find(n => n.type === 'customCommandNode' && commandNames(n).includes(parsedCommand.name));
      if (customCommandNode) {
        if (!session) ({ session } = await this.createSession(message, chatId));
        setCommandArgs(session, parsedCommand.args);
        await playerStore.recordEvent(this.botId, session.playerId, 'custom_command', customCommandNode.id, { command: parsedCommand.name });
        await this.openTransient(chatId, customCommandNode.id);
        await this.sessions.persist(chatId);
        return;
      }

      if (message.successful_payment && session) {
        const purchaseId = String(message.successful_payment.invoice_payload || '').replace(/^purchase:/, '');
        await adminStore.completePurchase(this.botId, session.playerId, purchaseId, message.successful_payment);
        const refreshed = await playerStore.loadPlayer(this.botId, session.playerId);
        session.vars = refreshed.variables;
        session.inventory = inventoryMap(refreshed.inventory);
        await playerStore.recordEvent(this.botId, session.playerId, 'purchase_paid', session.waiting?.nodeId, { purchaseId });
        await this.request('sendMessage', { chat_id: chatId, text: 'Покупка оплачена, награда выдана.' });
        const waitingNodeId = session.waiting?.type === 'purchase' ? session.waiting.nodeId : null;
        const transient = !!session.waiting?.transient;
        session.waiting = null;
        if (waitingNodeId) {
          const bot = this.botForSession(session);
          if (!bot) return;
          await this.execute(chatId, getNext(bot.edges, bot.nodes, waitingNodeId, 'continue') || getNext(bot.edges, bot.nodes, waitingNodeId), { transient });
        }
        await this.sessions.persist(chatId);
        return;
      }

      if (text.startsWith('/promo ') && session) { await this.applyPromocode(chatId, session, text.slice(7)); await this.sessions.persist(chatId); return; }
      if (text === '/starsshop' && session) { await this.sendShop(chatId); return; }
      if (text === '/ref'  && session)  { await this.request('sendMessage', { chat_id: chatId, text: `Ваша реферальная ссылка:\nhttps://t.me/${this.botInfo.username}?start=ref_${session.playerId}` }); return; }

      if (session?.waiting?.type === 'textInput') {
        const { varName, varType, nodeId, transient } = session.waiting;
        if (varType === 'number' && (text.trim() === '' || !Number.isFinite(Number(text)))) {
          await this.request('sendMessage', { chat_id: chatId, text: 'Введите число. Например: 42 или 3.14.' });
          return;
        }
        session.waiting = null;
        const val = varType === 'number' ? Number(text) : text;
        session.vars[varName] = { type: varType, value: val };
        await playerStore.saveVariables(this.botId, session.playerId, { [varName]: session.vars[varName] });
        await playerStore.recordEvent(this.botId, session.playerId, 'text_input', nodeId, { varName, value: val });
        const bot = this.botForSession(session);
        if (!bot) return;
        await this.execute(chatId, getNext(bot.edges, bot.nodes, nodeId, 'continue') || getNext(bot.edges, bot.nodes, nodeId), { transient });
        await this.sessions.persist(chatId);
        return;
      }

      if (session?.waiting?.type === 'promocode') {
        const bot = this.botForSession(session);
        if (!bot) return;
        const promoNode = bot.nodes.find(n => n.id === session.waiting.nodeId);
        const transient = !!session.waiting.transient;
        session.waiting = null;
        const applied = await this.applyPromocode(chatId, session, text, { errorText: promoNode?.data?.errorText });
        if (applied && promoNode) {
          if (!session.variables) session.variables = {};
          // New format: array of { varName, varValue }
          for (const entry of (promoNode.data.rewardVars || [])) {
            if (entry.varName?.trim()) {
              const n = Number(entry.varValue);
              session.variables[entry.varName.trim()] = Number.isFinite(n) && String(entry.varValue ?? '').trim() !== '' ? n : String(entry.varValue ?? '');
            }
          }
          // Backward compat: single var (old format)
          if (promoNode.data.rewardVarName?.trim() && !(promoNode.data.rewardVars?.length)) {
            const rawValue = promoNode.data.rewardVarValue ?? '';
            const numValue = Number(rawValue);
            session.variables[promoNode.data.rewardVarName.trim()] = Number.isFinite(numValue) && String(rawValue).trim() !== '' ? numValue : String(rawValue);
          }
        }
        if (promoNode) {
          const nextNodeId = applied && promoNode.data.successTargetNodeId
            ? promoNode.data.successTargetNodeId
            : (getNext(bot.edges, bot.nodes, promoNode.id, 'continue') || getNext(bot.edges, bot.nodes, promoNode.id));
          await this.execute(chatId, nextNodeId, { transient });
        }
        await this.sessions.persist(chatId);
        return;
      }
    } catch (e) {
      this.addLog('error', `handleUpdate: ${e.message}`);
    }
  }

  async handleCallback(callback) {
    // Callback-кнопки Telegram подтверждаем сразу, чтобы у игрока не висел
    // индикатор загрузки. После этого ищем ожидающую keyboard/poll-ноду и двигаем
    // сценарий по edge, привязанному к выбранному варианту.
    const chatId = callback.message?.chat?.id;
    await this.request('answerCallbackQuery', { callback_query_id: callback.id });
    const session = await this.sessions.get(chatId);
    if (chatId && session && callback.data?.startsWith('buy:')) { await this.sendInvoice(chatId, session, callback.data.slice(4)); return; }
    if (!chatId || session?.waiting?.type !== 'keyboard') return;

    const bot = this.botForSession(session);
    if (!bot) return;
    const node = bot.nodes.find(n => n.id === session.waiting.nodeId);
    const buttonId = callback.data?.startsWith('button:') ? callback.data.slice(7) : '';
    const button = (node?.data.buttons || []).find(b => b.id === buttonId);
    if (!node || !button) return;

    let transient = !!session.waiting.transient;
    session.waiting = null;
    const kbMsgId = callback.message?.message_id;
    if (kbMsgId) {
      try { await this.request('deleteMessage', { chat_id: chatId, message_id: kbMsgId }); } catch {}
    }
    session.keyboardMessageId = null;
    const edge = bot.edges.find(e => e.source === node.id && (e.sourceHandle === `left-${buttonId}` || e.sourceHandle === `right-${buttonId}`) && bot.nodes.some(t => t.id === e.target && t.type !== 'commentNode'));
    // If we're in transient (menu) and the button leads to a story node (not a menu-entry type),
    // break out of transient so the story runs normally and saves player position.
    if (transient && edge?.target) {
      const targetNode = bot.nodes.find(n => n.id === edge.target);
      const MENU_ENTRY_TYPES = new Set(['menuNode', 'settingsNode', 'customCommandNode', 'continueStoryNode', 'commentNode', 'groupNode', 'returnNode']);
      if (targetNode && !MENU_ENTRY_TYPES.has(targetNode.type)) transient = false;
    }
    const label = this.interp(button.label, this.templateVars(session), chatId, node.id);
    this.addLog('info', `Чат ${chatId}: «${label}»`);
    await playerStore.recordChoice(this.botId, session.playerId, node.id, buttonId, label);
    await playerStore.recordEvent(this.botId, session.playerId, 'keyboard_choice', node.id, { buttonId, label });
    await this.execute(chatId, edge?.target || null, { transient });
    await this.sessions.persist(chatId);
  }

  async handlePollAnswer(answer) {
    const wait = this.pollWaits.get(answer.poll_id);
    const chatId = wait?.chatId || answer.user?.id;
    if (!chatId) return;
    const session = await this.sessions.get(chatId);
    if (!session || session.waiting?.type !== 'poll' || session.waiting.pollId !== answer.poll_id) return;

    const bot = this.botForSession(session);
    if (!bot) return;
    const node = bot.nodes.find(n => n.id === session.waiting.nodeId);
    const options = pollOptions(node?.data || {}).slice(0, 10);
    const optionIndex = Number(answer.option_ids?.[0]);
    const option = Number.isInteger(optionIndex) ? options[optionIndex] : null;
    if (!node || !option) return;

    const transient = !!session.waiting.transient;
    this.pollWaits.delete(answer.poll_id);
    session.waiting = null;
    const correctIndex = Math.min(options.length - 1, Math.max(0, +node.data?.correctOption || 0));
    const resultHandle = node.data?.quiz ? (optionIndex === correctIndex ? 'correct' : 'wrong') : option.id;
    const edge = bot.edges.find(e => e.source === node.id && (e.sourceHandle === `left-${resultHandle}` || e.sourceHandle === `right-${resultHandle}`) && bot.nodes.some(t => t.id === e.target && t.type !== 'commentNode'));
    const label = this.interp(option.label, this.templateVars(session), chatId, node.id);
    this.addLog('info', `Чат ${chatId}: poll «${label}»`);
    await playerStore.recordChoice(this.botId, session.playerId, node.id, option.id, label);
    await playerStore.recordEvent(this.botId, session.playerId, 'poll_choice', node.id, { optionId: option.id, optionIndex, label, quiz: !!node.data?.quiz, correct: node.data?.quiz ? optionIndex === correctIndex : undefined });
    await this.execute(chatId, edge?.target || null, { transient });
    await this.sessions.persist(chatId);
  }

  async handleKeyboardTimeout(payload) {
    const { chatId, nodeId, transient } = payload;
    const session = await this.sessions.get(chatId);
    if (!session || session.waiting?.type !== 'keyboard' || session.waiting?.nodeId !== nodeId) return;
    session.waiting = null;
    const bot = this.botForSession(session);
    if (!bot) return;
    this.addLog('info', `Чат ${chatId}: таймаут клавиатуры ${nodeId}`);
    await this.execute(chatId, getNext(bot.edges, bot.nodes, nodeId, 'timeout'), { transient: !!transient });
    await this.sessions.persist(chatId);
  }

  // ── Promo / Shop / Invoice ─────────────────────────────────────────

  async applyPromocode(chatId, session, code, { errorText } = {}) {
    try {
      await playerStore.redeemPromocode(this.botId, session.playerId, code);
      const refreshed = await playerStore.loadPlayer(this.botId, session.playerId);
      session.vars = refreshed.variables;
      session.inventory = inventoryMap(refreshed.inventory);
      await playerStore.recordEvent(this.botId, session.playerId, 'promocode_redeemed', null, { code: String(code).trim().toUpperCase() });
      await this.request('sendMessage', { chat_id: chatId, text: 'Промокод применён.' });
      return true;
    } catch (e) {
      const used = e.message === 'PROMOCODE_ALREADY_USED';
      const msg = used ? 'Этот промокод уже использован.' : (errorText || 'Такого промокода не существует.');
      await this.request('sendMessage', { chat_id: chatId, text: msg });
      return false;
    }
  }

  async sendShop(chatId) {
    const products = (await adminStore.listProducts(this.botId)).filter(p => p.active);
    if (!products.length) { await this.request('sendMessage', { chat_id: chatId, text: 'Магазин пока пуст.' }); return; }
    await this.request('sendMessage', { chat_id: chatId, text: 'Магазин', reply_markup: { inline_keyboard: products.map(p => [{ text: `${p.title} - ${p.price_stars} Stars`, callback_data: `buy:${p.product_key}` }]) } });
  }

  async sendInvoice(chatId, session, productKey, nodeId = null, transient = false) {
    const product = await adminStore.getProduct(this.botId, productKey);
    if (!product) { await this.request('sendMessage', { chat_id: chatId, text: 'Товар не найден.' }); return false; }
    const purchaseId = await adminStore.createPurchase(this.botId, session.playerId, product);
    if (nodeId) session.waiting = { type: 'purchase', nodeId, purchaseId, transient };
    await this.request('sendInvoice', { chat_id: chatId, title: product.title, description: product.description || product.title, payload: `purchase:${purchaseId}`, provider_token: '', currency: 'XTR', prices: [{ label: product.title, amount: product.price_stars }] });
    return true;
  }

  // ── Content sending ────────────────────────────────────────────────

  async sendContent(chatId, data, vars = {}, nodeId = null) {
    const type = data.type || 'text';
    if (type === 'text') {
      const text = this.interp(data.text, vars, chatId, nodeId) || ' ';
      assertText(text, TELEGRAM_LIMITS.messageText, 'Текст сообщения');
      return this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(text) });
    }
    const map = { photo: ['sendPhoto', 'photo'], video: data.asVideoNote ? ['sendVideoNote', 'video_note'] : ['sendVideo', 'video'], voice: ['sendVoice', 'voice'], audio: ['sendVoice', 'voice'], document: ['sendDocument', 'document'] };
    const media = map[type];
    if (!media || !data.url) return;
    const extra = { protect_content: data.protected || undefined, has_spoiler: data.protected && (type === 'photo' || (type === 'video' && !data.asVideoNote)) ? true : undefined };
    const localPath = resolveLocalPath(data.url, MEDIA_DIR);
    if (data.asVideoNote && localPath) assertVideoNoteDuration(localPath);
    if (localPath) return this.upload(media[0], media[1], chatId, localPath, extra);
    return this.request(media[0], { chat_id: chatId, [media[1]]: data.url, ...extra });
  }

  async runContentSequence(chatId, node, items, index = 0, transient = false, skipCurrentDelay = false) {
    // Цепочки сообщений могут содержать задержки. Вместо удержания процесса
    // таймером на долгое время мы создаём scheduled job, который поднимет
    // выполнение позже и переживёт рестарт backend.
    const session = await this.sessions.get(chatId);
    if (!session) return;
    const bot = this.botForSession(session);
    if (!bot) return;
    for (let itemIndex = index; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      if (!skipCurrentDelay && (+item.delay || 0) > 0) {
        await adminStore.createJob(this.botId, 'scenario_resume', new Date(Date.now() + (+item.delay * 1000)).toISOString(), {
          chatId,
          playerId: session.playerId,
          nodeId: node.id,
          transient,
          sequence: { nodeId: node.id, itemIndex, kind: node.type },
        });
        this.addLog('info', `Чат ${chatId}: продолжение цепочки поставлено в очередь`);
        return;
      }
      const sent = await this.sendContent(chatId, item, this.templateVars(session), node.id);
      if (sent?.message_id) session.lastMessageId = sent.message_id;
      skipCurrentDelay = false;
    }
    const nextNodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
    await this.execute(chatId, nextNodeId, { transient });
  }

  async resumeContentSequence(chatId, sequence, transient = false) {
    const session = await this.sessions.get(chatId);
    if (!session) return;
    const bot = this.botForSession(session);
    if (!bot) return;
    const node = bot.nodes.find(item => item.id === sequence.nodeId);
    if (!node) return;
    if (node.type !== 'messageChainNode') return;
    const items = node.data.messages || [];
    await this.runContentSequence(chatId, node, items, sequence.itemIndex || 0, transient, true);
  }

  // ── Scenario execution ─────────────────────────────────────────────

  // Основной интерпретатор графа. Он идёт по nodeId, выполняет side effects ноды
  // и выбирает следующий nodeId через getNext/handles. Лимит 300 шагов защищает
  // от бесконечных циклов в сценарии; для намеренных циклов есть loopNode.
  async execute(chatId, initialNodeId, options = {}) {
    const session = await this.sessions.get(chatId);
    if (!session) return;
    const transient = options.transient === true;
    if (!initialNodeId) { if (transient) this.restoreTransient(session); return; }
    const bot = this.botForSession(session);
    if (!bot) { this.addLog('error', `execute: bot ${this.botId} is not available`); return; }
    // Ноды, которые реально взаимодействуют с игроком — только они сохраняются
    // как точка возобновления истории (current_node_id в БД).
    const PLAYER_FACING_NODES = new Set([
      'simpleMessageNode', 'messageChainNode', 'mediaNode', 'keyboardNode',
      'stickerNode', 'locationNode', 'pollNode', 'textInputNode',
      'editMessageNode', 'delayNode', 'promocodeNode', 'purchaseNode',
      'subscriptionCheckNode', 'starsShopNode', 'applicationNode',
    ]);

    let nodeId = initialNodeId;

    for (let step = 0; nodeId && step < 300; step++) {
      const node = bot.nodes.find(n => n.id === nodeId);
      if (!node) { if (transient) this.restoreTransient(session); return; }

      if (!transient) {
        session.storyResumeNodeId = node.id;
        if (PLAYER_FACING_NODES.has(node.type)) {
          await playerStore.setCurrentNode(this.botId, session.playerId, node.id);
        }
      }
      await playerStore.recordEvent(this.botId, session.playerId, 'node_enter', node.id, { nodeType: node.type, transient });
      this.addLog('info', `Чат ${chatId}: ${node.type} ${node.data.nodeId || node.id.slice(0, 7)}`);

      if (node.type !== 'keyboardNode') session.keyboardMessageId = null;

      switch (node.type) {

        case 'menuNode':
        case 'settingsNode':
        case 'customCommandNode':
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'continueStoryNode':
          if (transient) {
            const waiting = session.backgroundWaiting;
            this.restoreTransient(session);
            session.keyboardMessageId = null;
            if (waiting) return;
            if (!session.storyResumeNodeId) {
              await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(node.data.noSaveText || '⚠️ Нет сохранённого прогресса. Начните новую игру.') });
              return;
            }
            return this.execute(chatId, session.storyResumeNodeId);
          }
          nodeId = null;
          break;

        case 'invokeCommandNode': {
          const nextNodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          if (!transient) { session.storyResumeNodeId = nextNodeId; if (nextNodeId) await playerStore.setCurrentNode(this.botId, session.playerId, nextNodeId); }
          const targetNode = bot.nodes.find(n => n.id === node.data.targetNodeId);
          if (targetNode && ['menuNode', 'settingsNode', 'customCommandNode'].includes(targetNode.type)) {
            await playerStore.recordEvent(this.botId, session.playerId, 'command_invoke', node.id, { targetNodeId: node.data.targetNodeId });
            await this.openTransient(chatId, targetNode.id);
          } else if (nextNodeId) { nodeId = nextNodeId; break; }
          return;
        }

        case 'simpleMessageNode': {
          const sent = await this.sendContent(chatId, node.data, this.templateVars(session), node.id);
          if (sent?.message_id) session.lastMessageId = sent.message_id;
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'editMessageNode': {
          const text = this.interp(node.data.text || ' ', this.templateVars(session), chatId, node.id);
          const textData = telegramTextPayload(text);
          let sent;
          if (session.lastMessageId) {
            try {
              sent = await this.request('editMessageText', { chat_id: chatId, message_id: session.lastMessageId, ...textData });
            } catch (error) {
              this.addLog('warn', `editMessageText: ${error.message}`);
            }
          }
          if (!sent) sent = await this.request('sendMessage', { chat_id: chatId, ...textData });
          if (sent?.message_id) session.lastMessageId = sent.message_id;
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'pollNode': {
          const options = pollOptions(node.data).slice(0, 10);
          if (options.length >= 2) {
            const question = this.interp(node.data.question || 'Опрос', this.templateVars(session), chatId, node.id);
            const labels = options.map(option => this.interp(option.label || 'Вариант', this.templateVars(session), chatId, node.id));
            const sent = await this.request('sendPoll', {
              chat_id: chatId,
              question,
              options: labels,
              type: node.data.quiz ? 'quiz' : 'regular',
              is_anonymous: false,
              ...(node.data.quiz ? { correct_option_id: Math.min(labels.length - 1, Math.max(0, +node.data.correctOption || 0)) } : {}),
            });
            const pollId = sent?.poll?.id;
            session.waiting = { type: 'poll', nodeId: node.id, pollId, transient };
            if (pollId) this.pollWaits.set(pollId, { chatId, nodeId: node.id, transient });
            return;
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'stickerNode': {
          if (node.data.sticker) {
            const stickerLocalPath = resolveLocalPath(node.data.sticker, MEDIA_DIR);
            if (stickerLocalPath) {
              const ext = path.extname(stickerLocalPath).toLowerCase();
              if (ext === '.webp') await this.upload('sendSticker', 'sticker', chatId, stickerLocalPath);
              else await this.upload('sendPhoto', 'photo', chatId, stickerLocalPath);
            } else {
              await this.request('sendSticker', { chat_id: chatId, sticker: node.data.sticker });
            }
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'locationNode':
          await this.request('sendLocation', { chat_id: chatId, latitude: +node.data.latitude || 0, longitude: +node.data.longitude || 0 });
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'messageChainNode':
          await this.runContentSequence(chatId, node, node.data.messages || [], 0, transient);
          return;

        case 'mediaNode': {
          const items = node.data.items || [];
          const album = node.data.asAlbum && items.filter(i => (i.type === 'photo' || i.type === 'video') && i.url && !i.asVideoNote);
          if (album && album.length >= 2 && album.length <= 10 && album.length === items.length) {
            await this.sendMediaGroup(chatId, items);
          } else {
            const vars = this.templateVars(session);
            for (const item of items) {
              const sent = await this.sendContent(chatId, item, vars, node.id);
              if (sent?.message_id) session.lastMessageId = sent.message_id;
            }
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'textInputNode': {
          const prompt = this.interp(node.data.prompt || 'Введите ответ:', this.templateVars(session), chatId, node.id);
          await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(prompt) });
          session.waiting = { type: 'textInput', nodeId: node.id, varName: node.data.varName || '', varType: node.data.varType || 'text', transient };
          return;
        }

        case 'delayNode': {
          const nextNodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          await adminStore.createJob(this.botId, 'scenario_resume', new Date(Date.now() + delaySeconds(node.data) * 1000).toISOString(), { chatId, playerId: session.playerId, nodeId: nextNodeId, callStack: session.callStack || [], transient });
          this.addLog('info', `Чат ${chatId}: продолжение в очереди`);
          return;
        }

        case 'loopNode': {
          session.loopCounters ||= {};
          const counter = session.loopCounters[node.id] || 0;
          const max = Math.max(1, +node.data.maxIterations || 10);
          if (counter < max) { session.loopCounters[node.id] = counter + 1; nodeId = getNext(bot.edges, bot.nodes, node.id, 'body'); }
          else { delete session.loopCounters[node.id]; nodeId = getNext(bot.edges, bot.nodes, node.id, 'done'); }
          break;
        }

        case 'breakLoopNode': {
          if (node.data.targetLoopId) { session.loopCounters ||= {}; session.loopCounters[node.data.targetLoopId] = Infinity; }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'variableNode':
          for (const entry of node.data.entries || []) {
            if (!entry.varName) continue;
            // 'init' — set only if variable is not yet defined for this player
            if (entry.action === 'init' && session.vars[entry.varName] !== undefined) continue;
            const type = entry.varType || 'boolean';
            const current = session.vars[entry.varName] || { type, value: type === 'number' ? 0 : (type === 'text' ? '' : false) };
            let value = entry.value ?? (type === 'number' ? 0 : (type === 'text' ? '' : false));
            if (entry.action === 'increment') value = (+current.value || 0) + (+entry.value || 1);
            if (entry.action === 'decrement') value = (+current.value || 0) - (+entry.value || 1);
            session.vars[entry.varName] = { type: entry.varType || current.type, value };
          }
          await playerStore.saveVariables(this.botId, session.playerId, session.vars);
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'globalVariableNode':
          for (const entry of node.data.entries || []) {
            if (!entry.varName) continue;
            const type = entry.varType || 'number';
            const current = session.globalVars?.[entry.varName] || { type, value: type === 'number' ? 0 : false };
            let value = entry.value ?? (type === 'number' ? 0 : false);
            if (entry.action === 'increment') value = (+current.value || 0) + (+entry.value || 1);
            if (entry.action === 'decrement') value = (+current.value || 0) - (+entry.value || 1);
            if (session.globalVars) session.globalVars[entry.varName] = { type, value };
            await playerStore.setBotVariable(this.botId, entry.varName, type, value);
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'codexNode':
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'inventoryNode':
          session.inventory ||= {};
          for (const entry of node.data.entries || []) {
            if (!entry.itemKey) continue;
            const current = session.inventory[entry.itemKey] || 0;
            let qty = +entry.quantity || 0;
            if (entry.action === 'add') qty = current + qty;
            if (entry.action === 'remove') qty = Math.max(0, current - qty);
            session.inventory[entry.itemKey] = qty;
            await playerStore.setInventoryItem(this.botId, session.playerId, entry.itemKey, qty);
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'inventoryViewNode': {
          const entries = Object.entries(session.inventory || {}).filter(([, amount]) => Number(amount) > 0);
          const header = this.interp(node.data.header || 'Ваш инвентарь:', this.templateVars(session), chatId, node.id).trim();
          const itemFormat = node.data.itemFormat || '{{item}} x{{amount}}';
          const lines = entries.map(([item, amount]) => itemFormat.replace(/\{\{\s*item\s*\}\}/g, item).replace(/\{\{\s*amount\s*\}\}/g, String(amount)));
          const text = lines.length ? [header, ...lines].filter(Boolean).join('\n') : this.interp(node.data.emptyText || 'Инвентарь пуст.', this.templateVars(session), chatId, node.id);
          await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(text) });
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'relationNode':
          session.relations ||= {};
          for (const entry of node.data.entries || []) {
            const rKey = (entry.reputationType && entry.reputationTarget)
              ? `${entry.reputationType}.${entry.reputationTarget}`
              : (entry.characterKey || '');
            if (!rKey) continue;
            const current = session.relations[rKey] || 0;
            let value = +entry.value || 0;
            if (entry.action === 'add') value = current + value;
            if (entry.action === 'subtract') value = current - value;
            session.relations[rKey] = value;
            await playerStore.setRelation(this.botId, session.playerId, rKey, value);
            if (entry.notify) {
              const target = entry.reputationTarget || entry.characterKey || rKey;
              const rawText = entry.notifyText || 'Ваше отношение с "{{reputation.target}}" стало {{reputation.value}}.';
              const extraVars = {
                'reputation.target': { type: 'text', value: target },
                'reputation.value': { type: 'number', value },
              };
              const text = this.interp(rawText, { ...this.templateVars(session), ...extraVars }, chatId, node.id);
              await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(text) });
            }
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'achievementNode':
          if (node.data.achievementKey) {
            const newlyUnlocked = await playerStore.unlockAchievement(this.botId, session.playerId, node.data.achievementKey, { title: node.data.title || '', imageUrl: node.data.imageUrl || '' });
            session.achievementList = session.achievementList || [];
            if (!session.achievementList.includes(node.data.achievementKey)) session.achievementList.push(node.data.achievementKey);
            session.achievementMeta = { ...(session.achievementMeta || {}), [node.data.achievementKey]: { title: node.data.title || '', imageUrl: node.data.imageUrl || '' } };
            await playerStore.recordEvent(this.botId, session.playerId, 'achievement_unlocked', node.id, { achievementKey: node.data.achievementKey });
            if (newlyUnlocked) {
              session.vars ||= {};
              for (const entry of (node.data.rewardVars || [])) {
                const varName = String(entry.varName || '').trim();
                if (!varName) continue;
                const type = entry.varType || session.vars?.[varName]?.type || 'number';
                const current = session.vars?.[varName] || { type, value: type === 'number' ? 0 : (type === 'text' ? '' : false) };
                let value = parseRewardValue(entry.value ?? entry.varValue, type);
                if (entry.action === 'increment' && type === 'number') value = (+current.value || 0) + (+value || 0);
                if (entry.action === 'decrement' && type === 'number') value = (+current.value || 0) - (+value || 0);
                session.vars[varName] = { type, value };
              }
              await playerStore.saveVariables(this.botId, session.playerId, session.vars);
            }
            if (node.data.notify !== false) {
              const achievementTitle = this.interp(node.data.title || node.data.achievementKey, this.templateVars(session), chatId, node.id);
              const text = `🏆 Достижение: ${achievementTitle}`;
              await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(text) });
            }
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'achievementsViewNode': {
          const total = new Set((bot.nodes || []).filter(item => item.type === 'achievementNode' && item.data?.achievementKey).map(item => item.data.achievementKey)).size;
          const unlocked = (session.achievementList || []).filter(key => (bot.nodes || []).some(item => item.type === 'achievementNode' && item.data?.achievementKey === key)).length;
          const template = node.data.template || 'Достижения: {{achievements.unlocked}} / {{achievements.total}}\n{{achievements.list}}';
          const text = this.interp(
            template
              .replace(/\{\{\s*achievements\.unlocked\s*\}\}/g, String(unlocked))
              .replace(/\{\{\s*achievements\.total\s*\}\}/g, String(total))
              .replace(/\{\{\s*unlocked\s*\}\}/g, String(unlocked))
              .replace(/\{\{\s*total\s*\}\}/g, String(total)),
            this.templateVars(session),
            chatId,
            node.id
          );
          await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(text) });
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'formulaNode':
          if (node.data.formula && node.data.varName) {
            try {
              const value = evaluateFormulaExpression(node.data.formula, this.templateVars(session));
              session.vars[node.data.varName] = { type: 'number', value };
            } catch (error) {
              this.addLog('warn', `formulaNode ${node.id}: ${error.message}`);
            }
          } else {
            for (const entry of node.data.entries || []) {
              const variable = session.vars[entry.varName];
              if (!variable || variable.type !== 'number') continue;
              const operand = +entry.value || 0;
              if (entry.operator === 'set')      variable.value = operand;
              if (entry.operator === 'add')      variable.value = (+variable.value || 0) + operand;
              if (entry.operator === 'subtract') variable.value = (+variable.value || 0) - operand;
              if (entry.operator === 'multiply') variable.value = (+variable.value || 0) * operand;
              if (entry.operator === 'divide' && operand !== 0) variable.value = (+variable.value || 0) / operand;
            }
          }
          await playerStore.saveVariables(this.botId, session.playerId, session.vars);
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'resetProgressNode': {
          const preserveNames = [...new Set((node.data.preserveVars || [])
            .map(name => String(name || '').trim())
            .filter(Boolean))];
          const preserved = Object.fromEntries(preserveNames
            .filter(name => session.vars?.[name])
            .map(name => [name, session.vars[name]]));
          await playerStore.resetPlayer(this.botId, session.playerId, preserved);
          const refreshed = await playerStore.loadPlayer(this.botId, session.playerId);
          session.vars = refreshed?.variables || {};
          session.inventory = inventoryMap(refreshed?.inventory || []);
          session.relations = relationMap(refreshed?.relations || []);
          session.achievementList = (refreshed?.achievements || []).map(item => item.achievement_key);
          session.achievementMeta = Object.fromEntries((refreshed?.achievements || []).map(item => [item.achievement_key, item.metadata || {}]));
          session.storyResumeNodeId = findStoryRoot(bot)?.id || null;
          await playerStore.recordEvent(this.botId, session.playerId, 'progress_reset', node.id, { preserveVars: preserveNames });
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'branchingNode': {
          const branch = (node.data.branches || []).find(b => (b.conditions || []).length === 0 || b.conditions.every(cond => branchMatches(cond, session)));
          nodeId = branch
            ? getNext(bot.edges, bot.nodes, node.id, `branch-${branch.id}`) || getNext(bot.edges, bot.nodes, node.id, `branch-left-${branch.id}`)
            : null;
          break;
        }

        case 'randomNode': {
          const { roll, branch } = pickRandomBranch(node.data);
          await playerStore.recordEvent(this.botId, session.playerId, 'random_choice', node.id, { roll, branchId: branch?.id });
          nodeId = branch ? getNext(bot.edges, bot.nodes, node.id, `random-${branch.id}`) : null;
          break;
        }

        case 'keyboardNode': {
          const allButtons = node.data.buttons || [];
          const matchedButtons = allButtons.filter(btn => evaluateButtonCondition(btn, session));
          const visibleButtons = matchedButtons.slice(0, TELEGRAM_LIMITS.inlineKeyboardButtons);
          if (matchedButtons.length > TELEGRAM_LIMITS.inlineKeyboardButtons) {
            this.addLog('warn', `Чат ${chatId}: keyboard ${node.id} содержит ${matchedButtons.length} видимых кнопок, отправлены первые ${TELEGRAM_LIMITS.inlineKeyboardButtons}`);
          }
          if (visibleButtons.length === 0) { nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id); break; }
          const hasCallback = visibleButtons.some(b => b.type !== 'url');
          const keyboard = visibleButtons.map(btn =>
            btn.type === 'url'
              ? [{ text: this.interp(btn.label || 'Ссылка', this.templateVars(session), chatId, node.id), url: btn.url }]
              : [{ text: this.interp(btn.label || 'Вариант', this.templateVars(session), chatId, node.id), callback_data: `button:${btn.id}` }]
          );
          if (hasCallback) {
            let timeoutJobId = null;
            if ((node.data.timeout || 0) > 0) {
              const job = await adminStore.createJob(this.botId, 'keyboard_timeout', new Date(Date.now() + node.data.timeout * 1000).toISOString(), { chatId, playerId: session.playerId, nodeId: node.id, transient });
              timeoutJobId = job?.id;
            }
            session.waiting = { type: 'keyboard', nodeId: node.id, transient, timeoutJobId };
          }
          let sent = null;
          const promptText = this.interp(node.data.promptText || 'Ваш выбор:', this.templateVars(session), chatId, node.id);
          const keyboardPayload = { chat_id: chatId, ...telegramTextPayload(promptText), reply_markup: { inline_keyboard: keyboard } };
          if (session.keyboardMessageId) {
            try {
              sent = await this.request('editMessageText', { ...keyboardPayload, message_id: session.keyboardMessageId });
            } catch (error) {
              this.addLog('warn', `edit keyboard: ${error.message}`);
            }
          }
          if (!sent) sent = await this.request('sendMessage', keyboardPayload);
          if (sent?.message_id) session.keyboardMessageId = sent.message_id;
          if (hasCallback) return;
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'subscriptionCheckNode': {
          let subscribed = false;
          try {
            const member = await this.request('getChatMember', { chat_id: node.data.channelId, user_id: +session.playerId });
            subscribed = ['creator', 'administrator', 'member'].includes(member.status);
          } catch (e) { this.addLog('warn', `subscriptionCheck: ${e.message}`); }
          if (!subscribed && node.data.prompt) {
            const text = this.interp(node.data.prompt, this.templateVars(session), chatId, node.id);
            await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(text) });
          }
          await playerStore.recordEvent(this.botId, session.playerId, 'subscription_check', node.id, { channelId: node.data.channelId, subscribed });
          nodeId = getNext(bot.edges, bot.nodes, node.id, subscribed ? 'subscribed' : 'not_subscribed');
          break;
        }

        case 'httpRequestNode': {
          let success = false;
          let responseValue = '';
          try {
            const url = this.interp(node.data.url || '', this.templateVars(session), chatId, node.id);
            if (!/^https?:\/\//i.test(url)) throw new Error('HTTP-запрос поддерживает только URL с http:// или https://');
            const method = node.data.method || 'GET';
            let headers = {};
            try { headers = JSON.parse(node.data.headers || '{}'); } catch {}
            const body = node.data.body ? this.interp(node.data.body, this.templateVars(session), chatId, node.id) : undefined;
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), Math.min(30000, Math.max(500, +node.data.requestTimeout || 5000)));
            try {
              const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method !== 'GET' && body ? body : undefined, signal: controller.signal });
              clearTimeout(tid);
              const raw = await res.text();
              let parsed; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
              const extracted = extractByPath(parsed, node.data.responsePath);
              responseValue = extracted === undefined ? '' : (typeof extracted === 'object' ? JSON.stringify(extracted) : String(extracted));
              success = res.ok;
            } catch (fe) { clearTimeout(tid); throw fe; }
          } catch (e) { this.addLog('warn', `httpRequest: ${e.message}`); responseValue = e.message; }
          if (node.data.responseVar) { session.vars[node.data.responseVar] = { type: 'text', value: responseValue }; await playerStore.saveVariables(this.botId, session.playerId, session.vars); }
          nodeId = getNext(bot.edges, bot.nodes, node.id, success ? 'success' : 'error');
          break;
        }

        case 'promocodeNode':
          session.waiting = { type: 'promocode', nodeId: node.id, transient };
          await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(this.interp(node.data.prompt || 'Введите промокод:', this.templateVars(session), chatId, node.id)) });
          return;

        case 'subscenarioNode': {
          const returnNodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          session.callStack ||= [];
          if (returnNodeId) session.callStack.push(returnNodeId);
          nodeId = node.data.targetNodeId || returnNodeId;
          break;
        }

        case 'returnNode':
          nodeId = session.callStack?.pop() || null;
          break;

        case 'purchaseNode':
          if (await this.sendInvoice(chatId, session, node.data.productKey, node.id, transient)) return;
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'starsShopNode':
          await this.sendShop(chatId);
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'unlockCodexNode': {
          const unlockEntries = node.data.entries || [];
          session.vars ||= {};
          for (const entry of unlockEntries) {
            const name = codexVariableName(entry);
            if (!name) continue;
            session.vars[name] = { type: 'boolean', value: entry.value !== false };
            if (entry.value !== false) {
              const notifyText = this.interp(entry.notifyText ?? 'Кодекс обновлен', this.templateVars(session), chatId, node.id);
              await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(`📖 ${notifyText}`) });
            }
          }
          if (unlockEntries.length > 0) await playerStore.saveVariables(this.botId, session.playerId, session.vars);
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'editCodexNode': {
          const editEntries = node.data.entries || [];
          session.vars ||= {};
          for (const entry of editEntries) {
            const name = codexVariableName(entry);
            if (!name) continue;
            const text = this.interp(entry.text || '', this.templateVars(session), chatId, node.id);
            session.vars[name] = { type: 'text', value: text };
            const notifyText = this.interp(entry.notifyText ?? 'Кодекс дополнен', this.templateVars(session), chatId, node.id);
            await this.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(`📖 ${notifyText}`) });
          }
          if (editEntries.length > 0) await playerStore.saveVariables(this.botId, session.playerId, session.vars);
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'groupNode':
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'commentNode':
          nodeId = null;
          break;

        default:
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
      }
    }

    if (transient) { this.restoreTransient(session); return; }
    // Do NOT clear current_node_id when story runs out of nodes — the player may
    // have hit an unfinished branch. Keep the last player-facing position so that
    // "Продолжить историю" can resume from there.
    await playerStore.recordEvent(this.botId, session.playerId, 'scenario_complete', null);
  }
}

// ── Module-level API ───────────────────────────────────────────────────

async function start(botId, token) {
  const running = runtimes.get(botId);
  if (running?.running) return running.status();
  const saved = readConfig(botId);
  const selectedToken = token?.trim() || saved.token;
  if (!selectedToken) { const e = new Error('Сначала укажите Telegram-токен'); e.code = 'TOKEN_REQUIRED'; throw e; }
  const runtime = new TelegramRuntime(botId, selectedToken, saved);
  await runtime.start();
  writeConfig(botId, { token: selectedToken, webhookSecret: runtime.webhookSecret, enabled: true });
  runtimes.set(botId, runtime);
  return runtime.status();
}

async function stop(botId) {
  const runtime = runtimes.get(botId);
  await runtime?.stop();
  const config = readConfig(botId);
  if (config.token) writeConfig(botId, { ...config, enabled: false });
  return status(botId);
}

function status(botId) {
  const runtime = runtimes.get(botId);
  if (runtime) return runtime.status();
  return { running: false, tokenConfigured: !!readConfig(botId).token, token: readConfig(botId).token || '', botUsername: null, mode: process.env.PUBLIC_BASE_URL ? 'webhook' : 'polling', logs: [] };
}

async function handleWebhook(botId, secret, update) {
  const runtime = runtimes.get(botId);
  if (!runtime?.running || runtime.mode !== 'webhook' || runtime.webhookSecret !== secret) return false;
  await runtime.handleUpdate(update);
  return true;
}

async function broadcast(botId, chatIds, text) {
  const runtime = runtimes.get(botId);
  if (!runtime?.running) throw new Error('Telegram bot is not running');
  assertText(text, TELEGRAM_LIMITS.messageText, 'Текст рассылки');
  let sent = 0, failed = 0;
  for (const chatId of chatIds) {
    try {
      await runtime.request('sendMessage', { chat_id: chatId, ...telegramTextPayload(text) });
      sent++;
    } catch { failed++; }
  }
  return { sent, failed };
}

async function resumeScenario(botId, payload) {
  const runtime = runtimes.get(botId);
  if (!runtime?.running) throw new Error('Telegram bot is not running');
  const player = await playerStore.loadPlayer(botId, payload.playerId);
  if (!player) throw new Error('Player not found');
  const bot = await adminStore.selectScenarioForPlayer(botId, player.telegram_user_id) || readBot(botId);
  const chatId = payload.chatId;
  const storyRoot = findStoryRoot(bot);
  const globalVars = await playerStore.loadBotVariables(botId);
  let session = await runtime.sessions.get(chatId);
  if (!session) {
    session = { playerId: player.telegram_user_id, vars: player.variables, telegramVars: telegramVariables(player, chatId), inventory: inventoryMap(player.inventory), relations: relationMap(player.relations), achievementList: (player.achievements || []).map(a => a.achievement_key), achievementMeta: Object.fromEntries((player.achievements || []).map(a => [a.achievement_key, a.metadata || {}])), globalVars, loopCounters: {}, waiting: null, backgroundWaiting: null, callStack: payload.callStack || [], storyResumeNodeId: player.current_node_id || player.checkpoint_node_id || storyRoot?.id || null, bot };
    runtime.sessions.set(chatId, session);
  } else if (!session.bot) { session.bot = bot; session.globalVars = globalVars; session.telegramVars = telegramVariables(player, chatId); }
  if (payload.sequence) await runtime.resumeContentSequence(chatId, payload.sequence, !!payload.transient);
  else await runtime.execute(chatId, payload.nodeId, { transient: !!payload.transient });
  await runtime.sessions.persist(chatId);
}

async function handleKeyboardTimeout(botId, payload) {
  const runtime = runtimes.get(botId);
  if (!runtime?.running) return;
  await runtime.handleKeyboardTimeout(payload);
}

async function refreshCommands(botId) {
  const runtime = runtimes.get(botId);
  if (runtime?.running) await runtime.refreshCommands();
}

async function removePlayerSession(botId, chatId) {
  if (!chatId) return;
  const runtime = runtimes.get(botId);
  if (runtime) await runtime.sessions.del(chatId);
  else {
    const sessions = createSessionStore(botId);
    await sessions.del(chatId);
    sessions.close();
  }
}

async function startConfigured() {
  const files = fs.readdirSync(TELEGRAM_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const botId = path.basename(file, '.json');
    const config = readConfig(botId);
    if (!config.enabled || !config.token || !fs.existsSync(getBotPath(botId))) continue;
    try { await start(botId, config.token); } catch (e) { console.error(`Autostart ${botId}:`, e.message); }
  }
}

function remove(botId) {
  runtimes.get(botId)?.stop();
  runtimes.delete(botId);
  const configPath = getConfigPath(botId);
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

module.exports = { broadcast, handleWebhook, handleKeyboardTimeout, localMediaPath, refreshCommands, removePlayerSession, resumeScenario, start, startConfigured, stop, status, remove };
