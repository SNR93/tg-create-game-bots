const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const playerStore = require('./playerStore');
const adminStore = require('./adminStore');
const { TELEGRAM_LIMITS, assertText, assertVideoNoteDuration } = require('./telegramLimits');
const {
  getNext, interpolate, inventoryMap, relationMap,
  commandNames, parseCommand, setCommandArgs, branchMatches, inputMatches, findStoryRoot,
} = require('./graphUtils');
const { RateLimiter, resolveLocalPath, apiRequest, apiUpload, apiSendMediaGroup } = require('./telegramApi');
const { createSessionStore } = require('./sessionStore');

const DATA_DIR = path.join(__dirname, 'data');
const BOTS_DIR = path.join(DATA_DIR, 'bots');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const TELEGRAM_DIR = path.join(DATA_DIR, 'telegram');
const runtimes = new Map();

fs.mkdirSync(TELEGRAM_DIR, { recursive: true });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getBotPath(botId) {
  return path.join(BOTS_DIR, `${botId}.json`);
}

function getConfigPath(botId) {
  return path.join(TELEGRAM_DIR, `${botId}.json`);
}

function localMediaPath(url) {
  return resolveLocalPath(url, MEDIA_DIR);
}

function readBot(botId) {
  return JSON.parse(fs.readFileSync(getBotPath(botId), 'utf-8'));
}

function readConfig(botId) {
  const configPath = getConfigPath(botId);
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function writeConfig(botId, config) {
  fs.writeFileSync(getConfigPath(botId), JSON.stringify(config, null, 2));
}

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
  }

  addLog(level, message) {
    this.logs.push({ timestamp: new Date().toISOString(), level, message });
    if (this.logs.length > 300) this.logs.shift();
  }

  status() {
    return {
      running: this.running,
      tokenConfigured: true,
      token: this.token,
      botUsername: this.botInfo?.username || null,
      mode: this.mode,
      logs: this.logs,
    };
  }

  // ── Telegram API wrappers ──────────────────────────────────────────

  async request(method, payload = {}) {
    if (method === 'sendMessage') assertText(payload.text, TELEGRAM_LIMITS.messageText, 'Текст сообщения');
    if (method === 'setMyCommands') {
      (payload.commands || []).forEach(cmd => assertText(cmd.description, TELEGRAM_LIMITS.commandDescription, `Описание команды /${cmd.command}`));
    }
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

  // ── Interpolation with missing-variable logging ────────────────────

  interp(text, vars, chatId, nodeId) {
    const missing = [];
    const result = interpolate(text, vars, key => missing.push(key));
    if (missing.length > 0) {
      const location = nodeId ? ` (нода ${nodeId})` : '';
      this.addLog('warn', `Чат ${chatId}${location}: переменные не найдены — ${missing.join(', ')}`);
    }
    return result;
  }

  // ── Bot commands ───────────────────────────────────────────────────

  async refreshCommands() {
    if (!this.running) return;
    const bot = readBot(this.botId);
    const commands = [{ command: 'start', description: bot.nodes.some(n => n.type === 'menuNode') ? 'Открыть главное меню' : 'Начать игру' }];
    if (bot.nodes.some(n => n.type === 'settingsNode')) commands.push({ command: 'settings', description: 'Настройки' });
    const seen = new Set(commands.map(c => c.command));
    for (const node of bot.nodes.filter(n => n.type === 'customCommandNode' && n.data.showInMenu !== false)) {
      const command = commandNames(node)[0];
      if (!command || seen.has(command) || commands.length >= 100) continue;
      seen.add(command);
      commands.push({ command, description: String(node.data.description || node.data.title || 'Открыть команду').slice(0, 256) });
    }
    await this.request('setMyCommands', { commands });
  }

  // ── Session management ─────────────────────────────────────────────

  async createSession(message, chatId) {
    const draftBot = readBot(this.botId);
    let player = await playerStore.ensurePlayer(this.botId, message?.from || { id: chatId }, chatId);
    const bot = await adminStore.selectScenarioForPlayer(this.botId, player.telegram_user_id) || draftBot;
    player = await playerStore.ensurePlayer(this.botId, message?.from || { id: chatId }, chatId);
    const storyRoot = findStoryRoot(bot);
    const session = {
      playerId: player.telegram_user_id,
      vars: player.variables,
      inventory: inventoryMap(player.inventory),
      relations: relationMap(player.relations),
      waiting: null,
      backgroundWaiting: null,
      callStack: [],
      storyResumeNodeId: player.checkpoint_node_id || storyRoot?.id || null,
      bot,
    };
    this.sessions.set(chatId, session);
    return { player, session };
  }

  async openTransient(chatId, nodeId) {
    const session = this.sessions.has(chatId) ? (await this.sessions.get(chatId)) : null;
    if (!session || !nodeId) return;
    if (session.waiting && !session.waiting.transient && !session.backgroundWaiting) {
      session.backgroundWaiting = session.waiting;
    }
    session.waiting = null;
    await this.execute(chatId, nodeId, { transient: true });
  }

  restoreTransient(session) {
    session.waiting = session.backgroundWaiting || null;
    session.backgroundWaiting = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async start() {
    this.botInfo = await this.request('getMe');
    this.running = true;
    await this.refreshCommands();
    this.addLog('info', `Запущен @${this.botInfo.username || this.botInfo.first_name}`);
    const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    if (publicBaseUrl) {
      this.mode = 'webhook';
      await this.request('setWebhook', {
        url: `${publicBaseUrl}/api/telegram/webhook/${this.botId}/${this.webhookSecret}`,
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      });
      this.addLog('info', 'Telegram webhook подключен');
    } else {
      await this.request('deleteWebhook', { drop_pending_updates: false });
      this.poll().catch(error => {
        this.addLog('error', `Polling остановлен: ${error.message}`);
        this.running = false;
      });
    }
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    if (this.mode === 'webhook') await this.request('deleteWebhook', { drop_pending_updates: false });
    this.addLog('info', 'Остановлен пользователем');
  }

  async poll() {
    while (this.running) {
      try {
        const updates = await this.request('getUpdates', {
          offset: this.offset,
          timeout: 25,
          allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
        });
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (error) {
        if (!this.running) break;
        this.addLog('error', `Polling: ${error.message}`);
        await sleep(2000);
      }
    }
  }

  // ── Update handling ────────────────────────────────────────────────

  async handleUpdate(update) {
    try {
      if (update.pre_checkout_query) {
        await this.request('answerPreCheckoutQuery', { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
        return;
      }
      if (update.callback_query) {
        await this.handleCallback(update.callback_query);
        return;
      }

      const message = update.message;
      const chatId = message?.chat?.id;
      const text = message?.text || '';
      const incomingCommand = parseCommand(text);
      if (!chatId) return;

      // Load session from Redis if not in memory
      if (!this.sessions.has(chatId)) {
        const saved = await this.sessions.get(chatId);
        if (saved && !saved.bot) saved.bot = null; // will be resolved in createSession/execute
      }

      if (incomingCommand?.name === 'start') {
        const { player, session } = await this.createSession(message, chatId);
        const bot = session.bot;
        const referrerId = incomingCommand.args.startsWith('ref_') ? incomingCommand.args.slice(4) : '';
        if (referrerId) await playerStore.setReferrer(this.botId, player.telegram_user_id, referrerId);
        const menuNode = bot.nodes.find(n => n.type === 'menuNode');
        await playerStore.recordEvent(this.botId, player.telegram_user_id, 'scenario_start', session.storyResumeNodeId, { resumed: !!player.checkpoint_node_id, menu: !!menuNode });
        this.addLog('info', `Чат ${chatId}: /start`);
        if (menuNode) await this.openTransient(chatId, menuNode.id);
        else if (session.storyResumeNodeId) await this.execute(chatId, session.storyResumeNodeId);
        await this.sessions.persist(chatId);
        return;
      }

      let session = await this.sessions.get(chatId);
      if (incomingCommand?.name === 'settings') {
        if (!session) ({ session } = await this.createSession(message, chatId));
        const entryNode = session.bot.nodes.find(n => n.type === 'settingsNode');
        if (entryNode) {
          await playerStore.recordEvent(this.botId, session.playerId, 'command_menu_open', entryNode.id, { command: 'settings' });
          await this.openTransient(chatId, entryNode.id);
        } else {
          await this.request('sendMessage', { chat_id: chatId, text: 'Настройки не добавлены.' });
        }
        await this.sessions.persist(chatId);
        return;
      }

      const parsedCommand = incomingCommand;
      const customCommandNode = parsedCommand && (session?.bot || readBot(this.botId)).nodes.find(n =>
        n.type === 'customCommandNode' && commandNames(n).includes(parsedCommand.name)
      );
      if (customCommandNode) {
        if (!session) ({ session } = await this.createSession(message, chatId));
        setCommandArgs(session, parsedCommand.args);
        await playerStore.recordEvent(this.botId, session.playerId, 'custom_command', customCommandNode.id, { command: parsedCommand.name, args: parsedCommand.args });
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
          const bot = session.bot || readBot(this.botId);
          await this.execute(chatId, getNext(bot.edges, bot.nodes, waitingNodeId, 'continue') || getNext(bot.edges, bot.nodes, waitingNodeId), { transient });
        }
        await this.sessions.persist(chatId);
        return;
      }

      if (text.startsWith('/promo ') && session) {
        await this.applyPromocode(chatId, session, text.slice(7));
        await this.sessions.persist(chatId);
        return;
      }
      if (text === '/shop' && session) {
        await this.sendShop(chatId);
        return;
      }
      if (text === '/ref' && session) {
        await this.request('sendMessage', { chat_id: chatId, text: `Ваша реферальная ссылка:\nhttps://t.me/${this.botInfo.username}?start=ref_${session.playerId}` });
        return;
      }
      if (session?.waiting?.type === 'promocode') {
        const bot = session.bot || readBot(this.botId);
        const promoNode = bot.nodes.find(n => n.id === session.waiting.nodeId);
        const transient = !!session.waiting.transient;
        session.waiting = null;
        await this.applyPromocode(chatId, session, text);
        if (promoNode) await this.execute(chatId, getNext(bot.edges, bot.nodes, promoNode.id, 'continue') || getNext(bot.edges, bot.nodes, promoNode.id), { transient });
        await this.sessions.persist(chatId);
        return;
      }
      if (session?.waiting?.type === 'condition') {
        const bot = session.bot || readBot(this.botId);
        const conditionNode = bot.nodes.find(n => n.id === session.waiting.nodeId);
        if (!conditionNode) return;
        const transient = !!session.waiting.transient;
        session.waiting = null;
        const handle = inputMatches(conditionNode.data, text) ? 'yes' : 'no';
        await playerStore.recordEvent(this.botId, session.playerId, 'condition_input', conditionNode.id, { text, handle });
        await this.execute(chatId, getNext(bot.edges, bot.nodes, conditionNode.id, handle), { transient });
        await this.sessions.persist(chatId);
      }
    } catch (error) {
      this.addLog('error', `Обработка сообщения: ${error.message}`);
    }
  }

  async handleCallback(callback) {
    const chatId = callback.message?.chat?.id;
    await this.request('answerCallbackQuery', { callback_query_id: callback.id });
    const session = await this.sessions.get(chatId);
    if (chatId && session && callback.data?.startsWith('buy:')) {
      await this.sendInvoice(chatId, session, callback.data.slice(4));
      return;
    }
    if (!chatId || session?.waiting?.type !== 'keyboard') return;

    const bot = session.bot || readBot(this.botId);
    const node = bot.nodes.find(n => n.id === session.waiting.nodeId);
    const buttonId = callback.data?.startsWith('button:') ? callback.data.slice(7) : '';
    const button = (node?.data.buttons || []).find(b => b.id === buttonId);
    if (!node || !button) return;

    const transient = !!session.waiting.transient;
    session.waiting = null;
    const edge = bot.edges.find(e =>
      e.source === node.id &&
      (e.sourceHandle === `left-${buttonId}` || e.sourceHandle === `right-${buttonId}`) &&
      bot.nodes.some(target => target.id === e.target && target.type !== 'commentNode')
    );
    const label = this.interp(button.label, session.vars, chatId, node.id);
    this.addLog('info', `Чат ${chatId}: выбрано «${label}»`);
    await playerStore.recordChoice(this.botId, session.playerId, node.id, buttonId, label);
    await playerStore.recordEvent(this.botId, session.playerId, 'keyboard_choice', node.id, { buttonId, label });
    await this.execute(chatId, edge?.target || null, { transient });
    await this.sessions.persist(chatId);
  }

  // ── Promo / Shop / Invoice ─────────────────────────────────────────

  async applyPromocode(chatId, session, code) {
    try {
      await playerStore.redeemPromocode(this.botId, session.playerId, code);
      const refreshed = await playerStore.loadPlayer(this.botId, session.playerId);
      session.vars = refreshed.variables;
      session.inventory = inventoryMap(refreshed.inventory);
      await playerStore.recordEvent(this.botId, session.playerId, 'promocode_redeemed', null, { code: String(code).trim().toUpperCase() });
      await this.request('sendMessage', { chat_id: chatId, text: 'Промокод применен.' });
    } catch (error) {
      const used = error.message === 'PROMOCODE_ALREADY_USED';
      await this.request('sendMessage', { chat_id: chatId, text: used ? 'Этот промокод уже использован.' : 'Промокод не найден или больше не активен.' });
    }
  }

  async sendShop(chatId) {
    const products = (await adminStore.listProducts(this.botId)).filter(p => p.active);
    if (!products.length) {
      await this.request('sendMessage', { chat_id: chatId, text: 'Магазин пока пуст.' });
      return;
    }
    await this.request('sendMessage', {
      chat_id: chatId,
      text: 'Магазин',
      reply_markup: {
        inline_keyboard: products.map(p => [{
          text: `${p.title} - ${p.price_stars} Stars`,
          callback_data: `buy:${p.product_key}`,
        }]),
      },
    });
  }

  async sendInvoice(chatId, session, productKey, nodeId = null, transient = false) {
    const product = await adminStore.getProduct(this.botId, productKey);
    if (!product) {
      await this.request('sendMessage', { chat_id: chatId, text: 'Товар не найден или недоступен.' });
      return false;
    }
    const purchaseId = await adminStore.createPurchase(this.botId, session.playerId, product);
    if (nodeId) session.waiting = { type: 'purchase', nodeId, purchaseId, transient };
    await this.request('sendInvoice', {
      chat_id: chatId,
      title: product.title,
      description: product.description || product.title,
      payload: `purchase:${purchaseId}`,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: product.title, amount: product.price_stars }],
    });
    return true;
  }

  // ── Content sending ────────────────────────────────────────────────

  async sendContent(chatId, data, vars = {}, nodeId = null) {
    const type = data.type || 'text';
    if (type === 'text') {
      const text = this.interp(data.text, vars, chatId, nodeId) || ' ';
      assertText(text, TELEGRAM_LIMITS.messageText, 'Текст сообщения');
      await this.request('sendMessage', { chat_id: chatId, text });
      return;
    }
    const map = {
      photo: ['sendPhoto', 'photo'],
      video: data.asVideoNote ? ['sendVideoNote', 'video_note'] : ['sendVideo', 'video'],
      voice: ['sendVoice', 'voice'],
      audio: ['sendVoice', 'voice'],
      document: ['sendDocument', 'document'],
    };
    const media = map[type];
    if (!media || !data.url) return;
    const extra = {
      protect_content: data.protected || undefined,
      has_spoiler: data.protected && (type === 'photo' || (type === 'video' && !data.asVideoNote)) ? true : undefined,
    };
    const localPath = resolveLocalPath(data.url, MEDIA_DIR);
    if (data.asVideoNote && localPath) assertVideoNoteDuration(localPath);
    if (localPath) await this.upload(media[0], media[1], chatId, localPath, extra);
    else await this.request(media[0], { chat_id: chatId, [media[1]]: data.url, ...extra });
  }

  // ── Scenario execution ─────────────────────────────────────────────

  async execute(chatId, initialNodeId, options = {}) {
    const session = await this.sessions.get(chatId);
    if (!session) return;
    const transient = options.transient === true;
    if (!initialNodeId) {
      if (transient) this.restoreTransient(session);
      return;
    }
    const bot = session.bot || readBot(this.botId);
    if (!session.bot) session.bot = bot;
    let nodeId = initialNodeId;

    for (let step = 0; nodeId && step < 300; step++) {
      const node = bot.nodes.find(n => n.id === nodeId);
      if (!node) {
        if (transient) this.restoreTransient(session);
        return;
      }
      if (!transient) {
        session.storyResumeNodeId = node.id;
        await playerStore.setCurrentNode(this.botId, session.playerId, node.id);
      }
      await playerStore.recordEvent(this.botId, session.playerId, 'node_enter', node.id, { nodeType: node.type, transient });
      this.addLog('info', `Чат ${chatId}: ${node.type} ${node.data.nodeId || node.id.slice(0, 7)}`);

      switch (node.type) {
        case 'startNode':
        case 'menuNode':
        case 'settingsNode':
        case 'customCommandNode':
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'continueStoryNode':
          if (transient) {
            const waiting = session.backgroundWaiting;
            this.restoreTransient(session);
            if (waiting) return;
            return this.execute(chatId, session.storyResumeNodeId);
          }
          nodeId = null;
          break;

        case 'simpleMessageNode':
          await this.sendContent(chatId, node.data, session.vars, node.id);
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'messageChainNode':
          for (const msg of node.data.messages || []) {
            if (msg.delay > 0) await sleep(msg.delay * 1000);
            await this.sendContent(chatId, msg, session.vars, node.id);
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'mediaNode': {
          const items = node.data.items || [];
          const album = node.data.asAlbum && items.length >= 2 && items.length <= 10 &&
            items.every(item => (item.type === 'photo' || item.type === 'video') && item.url && !item.asVideoNote);
          if (album) {
            await this.sendMediaGroup(chatId, items);
          } else {
            for (const item of items) {
              if (item.delay > 0) await sleep(item.delay * 1000);
              await this.sendContent(chatId, item, session.vars, node.id);
            }
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;
        }

        case 'delayNode': {
          const nextNodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          await adminStore.createJob(this.botId, 'scenario_resume', new Date(Date.now() + (node.data.seconds || 3) * 1000).toISOString(), {
            chatId, playerId: session.playerId, nodeId: nextNodeId, callStack: session.callStack || [], transient,
          });
          this.addLog('info', `Чат ${chatId}: продолжение поставлено в очередь`);
          return;
        }

        case 'variableNode':
          for (const entry of node.data.entries || []) {
            if (!entry.varName) continue;
            const type = entry.varType || 'boolean';
            const current = session.vars[entry.varName] || { type, value: type === 'number' ? 0 : false };
            let value = entry.value ?? (type === 'number' ? 0 : false);
            if (entry.action === 'increment') value = (+current.value || 0) + (+entry.value || 1);
            if (entry.action === 'decrement') value = (+current.value || 0) - (+entry.value || 1);
            session.vars[entry.varName] = { type: entry.varType || current.type, value };
          }
          await playerStore.saveVariables(this.botId, session.playerId, session.vars);
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'inventoryNode':
          session.inventory ||= {};
          for (const entry of node.data.entries || []) {
            if (!entry.itemKey) continue;
            const current = session.inventory[entry.itemKey] || 0;
            let quantity = +entry.quantity || 0;
            if (entry.action === 'add') quantity = current + quantity;
            if (entry.action === 'remove') quantity = Math.max(0, current - quantity);
            session.inventory[entry.itemKey] = quantity;
            await playerStore.setInventoryItem(this.botId, session.playerId, entry.itemKey, quantity);
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'relationNode':
          session.relations ||= {};
          for (const entry of node.data.entries || []) {
            if (!entry.characterKey) continue;
            const current = session.relations[entry.characterKey] || 0;
            let value = +entry.value || 0;
            if (entry.action === 'add') value = current + value;
            if (entry.action === 'subtract') value = current - value;
            session.relations[entry.characterKey] = value;
            await playerStore.setRelation(this.botId, session.playerId, entry.characterKey, value);
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'achievementNode':
          if (node.data.achievementKey) {
            await playerStore.unlockAchievement(this.botId, session.playerId, node.data.achievementKey, { title: node.data.title || '' });
            await playerStore.recordEvent(this.botId, session.playerId, 'achievement_unlocked', node.id, { achievementKey: node.data.achievementKey });
            if (node.data.notify !== false) {
              await this.request('sendMessage', { chat_id: chatId, text: `Достижение: ${this.interp(node.data.title || node.data.achievementKey, session.vars, chatId, node.id)}` });
            }
          }
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'formulaNode':
          for (const entry of node.data.entries || []) {
            const variable = session.vars[entry.varName];
            if (!variable || variable.type !== 'number') continue;
            const operand = +entry.value || 0;
            if (entry.operator === 'set') variable.value = operand;
            if (entry.operator === 'add') variable.value = (+variable.value || 0) + operand;
            if (entry.operator === 'subtract') variable.value = (+variable.value || 0) - operand;
            if (entry.operator === 'multiply') variable.value = (+variable.value || 0) * operand;
            if (entry.operator === 'divide' && operand !== 0) variable.value = (+variable.value || 0) / operand;
          }
          await playerStore.saveVariables(this.botId, session.playerId, session.vars);
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'checkpointNode':
          await playerStore.setCheckpoint(this.botId, session.playerId, node.id);
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'randomNode': {
          const branches = node.data.branches || [];
          const total = branches.reduce((sum, b) => sum + Math.max(1, +b.weight || 1), 0);
          let roll = Math.random() * total;
          const branch = branches.find(b => (roll -= Math.max(1, +b.weight || 1)) < 0);
          await playerStore.recordEvent(this.botId, session.playerId, 'random_choice', node.id, { branchId: branch?.id, label: branch?.label });
          nodeId = branch ? getNext(bot.edges, bot.nodes, node.id, `random-${branch.id}`) : null;
          break;
        }

        case 'promocodeNode':
          session.waiting = { type: 'promocode', nodeId: node.id, transient };
          await this.request('sendMessage', { chat_id: chatId, text: this.interp(node.data.prompt || 'Введите промокод:', session.vars, chatId, node.id) });
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

        case 'conditionNode':
          session.waiting = { type: 'condition', nodeId: node.id, transient };
          return;

        case 'keyboardNode':
          session.waiting = { type: 'keyboard', nodeId: node.id, transient };
          await this.request('sendMessage', {
            chat_id: chatId,
            text: '⁣',
            reply_markup: {
              inline_keyboard: (node.data.buttons || []).map(button => [{
                text: this.interp(button.label || 'Вариант', session.vars, chatId, node.id),
                callback_data: `button:${button.id}`,
              }]),
            },
          });
          return;

        case 'branchingNode': {
          const branch = (node.data.branches || []).find(b =>
            (b.conditions || []).length === 0 ||
            b.conditions.every(cond => branchMatches(cond, session.vars))
          );
          nodeId = branch ? getNext(bot.edges, bot.nodes, node.id, `branch-${branch.id}`) : null;
          break;
        }

        case 'applicationNode':
          await this.request('sendMessage', { chat_id: chatId, text: this.interp(node.data.title || 'Уведомление', session.vars, chatId, node.id) });
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'invokeCommandNode': {
          const nextNodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          // Advance story cursor before opening transient so continueStoryNode returns to the correct place
          if (!transient) {
            session.storyResumeNodeId = nextNodeId;
            if (nextNodeId) await playerStore.setCurrentNode(this.botId, session.playerId, nextNodeId);
          }
          const targetNode = bot.nodes.find(n => n.id === node.data.targetNodeId);
          if (targetNode && ['menuNode', 'settingsNode', 'customCommandNode'].includes(targetNode.type)) {
            await playerStore.recordEvent(this.botId, session.playerId, 'command_invoke', node.id, { targetNodeId: node.data.targetNodeId });
            await this.openTransient(chatId, targetNode.id);
          } else if (nextNodeId) {
            nodeId = nextNodeId;
            break;
          }
          return;
        }

        // Structural-only nodes — traverse to next without any effect
        case 'groupNode':
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
          break;

        case 'commentNode':
          // commentNode should never be reachable (getNext filters them),
          // but guard here to avoid an infinite loop if edge data is malformed.
          nodeId = null;
          break;

        default:
          nodeId = getNext(bot.edges, bot.nodes, node.id, 'continue') || getNext(bot.edges, bot.nodes, node.id);
      }
    }

    if (transient) {
      this.restoreTransient(session);
      return;
    }
    session.storyResumeNodeId = null;
    await playerStore.setCurrentNode(this.botId, session.playerId, null);
    await playerStore.recordEvent(this.botId, session.playerId, 'scenario_complete', null);
  }
}

// ── Module-level API ───────────────────────────────────────────────────

async function start(botId, token) {
  const running = runtimes.get(botId);
  if (running?.running) return running.status();

  const saved = readConfig(botId);
  const selectedToken = token?.trim() || saved.token;
  if (!selectedToken) {
    const error = new Error('Сначала укажите Telegram-токен');
    error.code = 'TOKEN_REQUIRED';
    throw error;
  }

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
  return {
    running: false,
    tokenConfigured: !!readConfig(botId).token,
    token: readConfig(botId).token || '',
    botUsername: null,
    mode: process.env.PUBLIC_BASE_URL ? 'webhook' : 'polling',
    logs: [],
  };
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
  for (const chatId of chatIds) {
    await runtime.request('sendMessage', { chat_id: chatId, text });
  }
}

async function resumeScenario(botId, payload) {
  const runtime = runtimes.get(botId);
  if (!runtime?.running) throw new Error('Telegram bot is not running');
  const player = await playerStore.loadPlayer(botId, payload.playerId);
  if (!player) throw new Error('Player not found');
  const bot = await adminStore.selectScenarioForPlayer(botId, player.telegram_user_id) || readBot(botId);
  const storyRoot = findStoryRoot(bot);
  const chatId = payload.chatId;
  let session = await runtime.sessions.get(chatId);
  if (!session) {
    session = {
      playerId: player.telegram_user_id,
      vars: player.variables,
      inventory: inventoryMap(player.inventory),
      relations: relationMap(player.relations),
      waiting: null,
      backgroundWaiting: null,
      callStack: payload.callStack || [],
      storyResumeNodeId: player.current_node_id || player.checkpoint_node_id || storyRoot?.id || null,
      bot,
    };
    runtime.sessions.set(chatId, session);
  } else if (!session.bot) {
    session.bot = bot;
  }
  await runtime.execute(chatId, payload.nodeId, { transient: !!payload.transient });
  await runtime.sessions.persist(chatId);
}

async function refreshCommands(botId) {
  const runtime = runtimes.get(botId);
  if (runtime?.running) await runtime.refreshCommands();
}

async function startConfigured() {
  const files = fs.readdirSync(TELEGRAM_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const botId = path.basename(file, '.json');
    const config = readConfig(botId);
    if (!config.enabled || !config.token || !fs.existsSync(getBotPath(botId))) continue;
    try {
      await start(botId, config.token);
    } catch (error) {
      console.error(`Telegram bot ${botId} autostart failed:`, error.message);
    }
  }
}

function remove(botId) {
  runtimes.get(botId)?.stop();
  runtimes.delete(botId);
  const configPath = getConfigPath(botId);
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

module.exports = { broadcast, handleWebhook, localMediaPath, refreshCommands, resumeScenario, start, startConfigured, stop, status, remove };
