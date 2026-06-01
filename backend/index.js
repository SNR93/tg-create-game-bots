const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
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
const MEDIA_FOLDERS = {
  photo: 'photos',
  video: 'videos',
  voice: 'voices',
  audio: 'audio',
  document: 'documents',
};

fs.mkdirSync(BOTS_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

app.use(cors());
app.use('/api/media', express.static(MEDIA_DIR));

function getBotPath(id) {
  return path.join(BOTS_DIR, `${id}.json`);
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
    const data = JSON.parse(fs.readFileSync(path.join(BOTS_DIR, f), 'utf-8'));
    return { id: data.id, name: data.name, updatedAt: data.updatedAt };
  }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// POST /api/bots/:id/media/:type — store uploaded content outside bot JSON
app.post('/api/bots/:id/media/:type', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
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
    const duration = ['video', 'voice', 'audio'].includes(req.params.type) ? probeDuration(storedPath) : null;
    if (req.params.type === 'video' && duration === null) {
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

app.post('/api/telegram/webhook/:id/:secret', asyncRoute(async (req, res) => {
  const accepted = await telegramRuntime.handleWebhook(req.params.id, req.params.secret, req.body);
  res.status(accepted ? 200 : 404).json({ ok: accepted });
}));

// GET /api/bots — list all bots
app.get('/api/bots', (req, res) => {
  try {
    res.json(listBots());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/bots — create new bot
app.post('/api/bots', (req, res) => {
  try {
    const id = uuidv4();
    const now = new Date().toISOString();
    const menuId = uuidv4();
    const bot = {
      id,
      name: req.body.name || 'Новый бот',
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: menuId,
          type: 'menuNode',
          position: { x: 250, y: 80 },
          data: { title: 'Глобальное меню', nodeId: menuId.slice(0, 7) },
        },
      ],
      edges: [],
      snapshots: [],
    };
    fs.writeFileSync(getBotPath(id), JSON.stringify(bot, null, 2));
    res.status(201).json(bot);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bots/:id — get bot
app.get('/api/bots/:id', (req, res) => {
  const p = getBotPath(req.params.id);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
});

// PUT /api/bots/:id — save bot
app.put('/api/bots/:id', (req, res) => {
  try {
    const p = getBotPath(req.params.id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const updated = { ...existing, ...req.body, id: existing.id, updatedAt: new Date().toISOString() };
    const validationErrors = validateScenario(updated, url => telegramRuntime.localMediaPath(url));
    if (validationErrors.length) return res.status(400).json({ error: validationErrors.join('\n') });
    fs.writeFileSync(p, JSON.stringify(updated, null, 2));
    telegramRuntime.refreshCommands(req.params.id).catch(error => console.error('Telegram commands refresh failed:', error.message));
    res.json(updated);
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
  await playerStore.deletePlayer(req.params.id, req.params.playerId);
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

app.get('/api/bots/:id/admin/roles', asyncRoute(async (req, res) => {
  res.json(await adminStore.listRoles(req.params.id));
}));

app.put('/api/bots/:id/admin/roles/:userKey', asyncRoute(async (req, res) => {
  res.json(await adminStore.saveRole(req.params.id, req.params.userKey, req.body.role));
}));

app.delete('/api/bots/:id/admin/roles/:userKey', asyncRoute(async (req, res) => {
  await adminStore.deleteRole(req.params.id, req.params.userKey);
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
app.delete('/api/bots/:id', (req, res) => {
  const p = getBotPath(req.params.id);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  telegramRuntime.remove(req.params.id);
  fs.unlinkSync(p);
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

initDatabase()
  .then(async () => {
    await telegramRuntime.startConfigured();
    startJobWorker({
      broadcast: async job => {
        const playerIds = job.payload.playerIds || [];
        const result = await pool.query(`
          SELECT chat_id FROM players WHERE bot_id = $1 AND chat_id IS NOT NULL
            AND ($2::text[] = '{}' OR telegram_user_id = ANY($2::text[]))
        `, [job.bot_id, playerIds]);
        await telegramRuntime.broadcast(job.bot_id, result.rows.map(row => row.chat_id), job.payload.text || '');
      },
      scenario_resume: async job => telegramRuntime.resumeScenario(job.bot_id, job.payload),
    });
    app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
  })
  .catch(error => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
