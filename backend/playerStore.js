/**
 * Codex developer notes:
 * Слой доступа к данным игроков: переменные, инвентарь, отношения, достижения, события и глобальные переменные бота.
 * Модуль скрывает SQL от runtime и админ-панели, чтобы игровая логика работала через стабильные функции.
 * Изменения здесь проверяются особенно аккуратно, потому что они влияют на прогресс игроков.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

const { pool } = require('./database');

function defaultValue(type) {
  if (type === 'number') return 0;
  if (type === 'text') return '';
  return false;
}

function normalizeVariable(variable) {
  return {
    type: variable.type || 'boolean',
    value: variable.value ?? variable.defaultValue ?? defaultValue(variable.type),
  };
}

// ensurePlayer вызывается при первом входе игрока и при административном создании.
// Функция идемпотентна: повторный /start обновляет профиль и last_seen_at, но не
// сбрасывает переменные, инвентарь, отношения и достижения игрока.
async function ensurePlayer(botId, user, chatId, initialVars = {}) {
  const playerId = String(user?.id || chatId);
  await pool.query(`
    INSERT INTO players (bot_id, telegram_user_id, chat_id, username, first_name, last_name)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (bot_id, telegram_user_id) DO UPDATE SET
      chat_id = EXCLUDED.chat_id,
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = NOW(),
      last_seen_at = NOW()
  `, [botId, playerId, String(chatId), user?.username || null, user?.first_name || null, user?.last_name || null]);

  for (const [name, variable] of Object.entries(initialVars)) {
    const normalized = normalizeVariable(variable);
    await pool.query(`
      INSERT INTO player_variables (bot_id, telegram_user_id, var_name, var_type, value)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (bot_id, telegram_user_id, var_name) DO NOTHING
    `, [botId, playerId, name, normalized.type, JSON.stringify(normalized.value)]);
  }

  return loadPlayer(botId, playerId);
}

// loadPlayer собирает полную карточку игрока из нескольких таблиц. Runtime и
// админ-панели удобнее работать с одной структурой, поэтому SQL-детали остаются
// в этом модуле, а наружу уходит готовый объект.
async function loadPlayer(botId, playerId) {
  const playerResult = await pool.query(`
    SELECT * FROM players WHERE bot_id = $1 AND telegram_user_id = $2
  `, [botId, String(playerId)]);
  if (!playerResult.rows[0]) return null;

  const [variables, inventory, relations, choices, achievements] = await Promise.all([
    pool.query(`SELECT var_name, var_type, value FROM player_variables WHERE bot_id = $1 AND telegram_user_id = $2 ORDER BY var_name`, [botId, String(playerId)]),
    pool.query(`SELECT item_key, quantity, metadata FROM player_inventory WHERE bot_id = $1 AND telegram_user_id = $2 ORDER BY item_key`, [botId, String(playerId)]),
    pool.query(`SELECT character_key, value, metadata FROM player_relations WHERE bot_id = $1 AND telegram_user_id = $2 ORDER BY character_key`, [botId, String(playerId)]),
    pool.query(`SELECT id, node_id, choice_key, choice_label, created_at FROM player_choices WHERE bot_id = $1 AND telegram_user_id = $2 ORDER BY created_at DESC LIMIT 100`, [botId, String(playerId)]),
    pool.query(`SELECT achievement_key, metadata, unlocked_at FROM player_achievements WHERE bot_id = $1 AND telegram_user_id = $2 ORDER BY unlocked_at DESC`, [botId, String(playerId)]),
  ]);

  return {
    ...playerResult.rows[0],
    variables: Object.fromEntries(variables.rows.map(row => [row.var_name, { type: row.var_type, value: row.value }])),
    inventory: inventory.rows,
    relations: relations.rows,
    choices: choices.rows,
    achievements: achievements.rows,
  };
}

async function listPlayers(botId, query = '') {
  const search = `%${query.trim().toLowerCase()}%`;
  const result = await pool.query(`
    SELECT
      p.*,
      (SELECT COUNT(*)::int FROM player_inventory i WHERE i.bot_id = p.bot_id AND i.telegram_user_id = p.telegram_user_id) AS inventory_items,
      (SELECT COUNT(*)::int FROM player_choices c WHERE c.bot_id = p.bot_id AND c.telegram_user_id = p.telegram_user_id) AS choices_count
    FROM players p
    WHERE p.bot_id = $1
      AND ($2 = '%%' OR LOWER(COALESCE(p.username, '') || ' ' || COALESCE(p.first_name, '') || ' ' || p.telegram_user_id) LIKE $2)
    ORDER BY p.last_seen_at DESC
    LIMIT 500
  `, [botId, search]);
  return result.rows;
}

async function saveVariables(botId, playerId, variables) {
  // command.* — временные аргументы пользовательских команд; их нельзя сохранять
  // как постоянный прогресс игрока, иначе следующий запуск команды увидит старые
  // аргументы.
  for (const [name, variable] of Object.entries(variables || {})) {
    if (name.startsWith('command.')) continue;
    const normalized = normalizeVariable(variable);
    await setVariable(botId, playerId, name, normalized.type, normalized.value);
  }
}

async function setVariable(botId, playerId, name, type, value) {
  await pool.query(`
    INSERT INTO player_variables (bot_id, telegram_user_id, var_name, var_type, value, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    ON CONFLICT (bot_id, telegram_user_id, var_name) DO UPDATE SET
      var_type = EXCLUDED.var_type,
      value = EXCLUDED.value,
      updated_at = NOW()
  `, [botId, String(playerId), name, type, JSON.stringify(value)]);
}

async function deleteVariable(botId, playerId, name) {
  await pool.query(`DELETE FROM player_variables WHERE bot_id = $1 AND telegram_user_id = $2 AND var_name = $3`, [botId, String(playerId), name]);
}

async function setInventoryItem(botId, playerId, itemKey, quantity, metadata = {}) {
  if (+quantity <= 0) {
    await pool.query(`DELETE FROM player_inventory WHERE bot_id = $1 AND telegram_user_id = $2 AND item_key = $3`, [botId, String(playerId), itemKey]);
    return;
  }
  await pool.query(`
    INSERT INTO player_inventory (bot_id, telegram_user_id, item_key, quantity, metadata, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    ON CONFLICT (bot_id, telegram_user_id, item_key) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  `, [botId, String(playerId), itemKey, +quantity, JSON.stringify(metadata)]);
}

async function deleteInventoryItem(botId, playerId, itemKey) {
  await pool.query(`DELETE FROM player_inventory WHERE bot_id = $1 AND telegram_user_id = $2 AND item_key = $3`, [botId, String(playerId), itemKey]);
}

async function setRelation(botId, playerId, characterKey, value, metadata = {}) {
  await pool.query(`
    INSERT INTO player_relations (bot_id, telegram_user_id, character_key, value, metadata, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    ON CONFLICT (bot_id, telegram_user_id, character_key) DO UPDATE SET
      value = EXCLUDED.value,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  `, [botId, String(playerId), characterKey, +value || 0, JSON.stringify(metadata)]);
}

async function deleteRelation(botId, playerId, characterKey) {
  await pool.query(`DELETE FROM player_relations WHERE bot_id = $1 AND telegram_user_id = $2 AND character_key = $3`, [botId, String(playerId), characterKey]);
}

async function unlockAchievement(botId, playerId, achievementKey, metadata = {}) {
  const inserted = await pool.query(`
    INSERT INTO player_achievements (bot_id, telegram_user_id, achievement_key, metadata)
    VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT (bot_id, telegram_user_id, achievement_key) DO NOTHING
    RETURNING achievement_key
  `, [botId, String(playerId), achievementKey, JSON.stringify(metadata)]);
  if (inserted.rows[0]) return true;
  await pool.query(`
    UPDATE player_achievements
    SET metadata = $4::jsonb
    WHERE bot_id = $1 AND telegram_user_id = $2 AND achievement_key = $3
  `, [botId, String(playerId), achievementKey, JSON.stringify(metadata)]);
  return false;
}

async function deleteAchievement(botId, playerId, achievementKey) {
  await pool.query(`DELETE FROM player_achievements WHERE bot_id = $1 AND telegram_user_id = $2 AND achievement_key = $3`, [botId, String(playerId), achievementKey]);
}

async function setReferrer(botId, playerId, referrerId) {
  if (!referrerId || String(playerId) === String(referrerId)) return;
  await pool.query(`
    UPDATE players SET referrer_id = $3, updated_at = NOW()
    WHERE bot_id = $1 AND telegram_user_id = $2 AND referrer_id IS NULL
  `, [botId, String(playerId), String(referrerId)]);
}

// Награды применяются внутри транзакции вызывающего кода. Это важно для промокодов
// и Stars-покупок: нельзя увеличить счётчик использования или закрыть покупку,
// если переменные/инвентарь не обновились целиком.
async function applyRewards(client, botId, playerId, rewards = {}) {
  for (const [itemKey, spec] of Object.entries(rewards.inventory || {})) {
    const { action, value } = (typeof spec === 'object' && spec !== null) ? spec : { action: 'add', value: spec };
    const qty = Math.abs(Number(value) || 0);
    if (action === 'set') {
      if (qty <= 0) {
        await client.query(`DELETE FROM player_inventory WHERE bot_id=$1 AND telegram_user_id=$2 AND item_key=$3`, [botId, String(playerId), itemKey]);
      } else {
        await client.query(`
          INSERT INTO player_inventory (bot_id, telegram_user_id, item_key, quantity)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (bot_id, telegram_user_id, item_key) DO UPDATE SET quantity = $4, updated_at = NOW()
        `, [botId, String(playerId), itemKey, qty]);
      }
    } else if (action === 'subtract') {
      await client.query(`
        INSERT INTO player_inventory (bot_id, telegram_user_id, item_key, quantity)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (bot_id, telegram_user_id, item_key) DO UPDATE SET
          quantity = GREATEST(0, player_inventory.quantity - $4), updated_at = NOW()
      `, [botId, String(playerId), itemKey, qty]);
    } else {
      await client.query(`
        INSERT INTO player_inventory (bot_id, telegram_user_id, item_key, quantity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (bot_id, telegram_user_id, item_key) DO UPDATE SET
          quantity = GREATEST(0, player_inventory.quantity + EXCLUDED.quantity), updated_at = NOW()
      `, [botId, String(playerId), itemKey, qty]);
    }
  }
  for (const [name, reward] of Object.entries(rewards.variables || {})) {
    const config = typeof reward === 'object' && reward !== null ? reward : { value: reward };
    const type = config.type || (typeof config.value === 'number' ? 'number' : typeof config.value === 'boolean' ? 'boolean' : 'text');
    const existing = await client.query(`
      SELECT value FROM player_variables WHERE bot_id = $1 AND telegram_user_id = $2 AND var_name = $3
    `, [botId, String(playerId), name]);
    let value = config.value ?? defaultValue(type);
    if (config.action === 'add' && type === 'number') value = (+existing.rows[0]?.value || 0) + (+value || 0);
    await client.query(`
      INSERT INTO player_variables (bot_id, telegram_user_id, var_name, var_type, value, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      ON CONFLICT (bot_id, telegram_user_id, var_name) DO UPDATE SET
        var_type = EXCLUDED.var_type, value = EXCLUDED.value, updated_at = NOW()
    `, [botId, String(playerId), name, type, JSON.stringify(value)]);
  }
}

// Промокод блокируется SELECT ... FOR UPDATE, чтобы два параллельных запроса не
// могли одновременно потратить последний доступный use или выдать награду дважды.
async function redeemPromocode(botId, playerId, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT * FROM promocodes
      WHERE bot_id = $1 AND code = $2 AND active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (max_uses IS NULL OR uses < max_uses)
      FOR UPDATE
    `, [botId, code]);
    const promo = result.rows[0];
    if (!promo) throw new Error('PROMOCODE_NOT_FOUND');
    const inserted = await client.query(`
      INSERT INTO player_promocodes (bot_id, telegram_user_id, code)
      VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING code
    `, [botId, String(playerId), code]);
    if (!inserted.rows[0]) throw new Error('PROMOCODE_ALREADY_USED');
    await applyRewards(client, botId, playerId, promo.rewards);
    await client.query(`UPDATE promocodes SET uses = uses + 1, updated_at = NOW() WHERE bot_id = $1 AND code = $2`, [botId, code]);
    await client.query('COMMIT');
    return promo;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function setCurrentNode(botId, playerId, nodeId) {
  await pool.query(`
    UPDATE players SET current_node_id = $3, updated_at = NOW(), last_seen_at = NOW()
    WHERE bot_id = $1 AND telegram_user_id = $2
  `, [botId, String(playerId), nodeId || null]);
}

async function setCheckpoint(botId, playerId, nodeId) {
  await pool.query(`
    UPDATE players SET checkpoint_node_id = $3, current_node_id = $3, updated_at = NOW(), last_seen_at = NOW()
    WHERE bot_id = $1 AND telegram_user_id = $2
  `, [botId, String(playerId), nodeId]);
}

// Сброс игрока очищает прогресс прохождения и связанные игровые таблицы, а также
// удаляет отложенные jobs этого игрока. preserveVariables нужен для нод/админки,
// где часть переменных должна пережить сброс.
async function resetPlayer(botId, playerId, preserveVariables = {}) {
  const client = await pool.connect();
  const normalizedPlayerId = String(playerId);
  try {
    await client.query('BEGIN');
    await client.query(`
      DELETE FROM scheduled_jobs
      WHERE bot_id = $1
        AND (payload ->> 'playerId' = $2 OR payload ->> 'chatId' = $2 OR (payload -> 'playerIds') ? $2)
    `, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM analytics_events WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_promocodes WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_variables WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_inventory WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_relations WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_choices WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_achievements WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    for (const [name, variable] of Object.entries(preserveVariables || {})) {
      if (!String(name || '').trim()) continue;
      const normalized = normalizeVariable(variable);
      await client.query(`
        INSERT INTO player_variables (bot_id, telegram_user_id, var_name, var_type, value, updated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      `, [botId, normalizedPlayerId, String(name).trim(), normalized.type, JSON.stringify(normalized.value)]);
    }
    await client.query(`UPDATE players SET current_node_id = NULL, checkpoint_node_id = NULL, updated_at = NOW() WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deletePlayer(botId, playerId) {
  const normalizedPlayerId = String(playerId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const player = (await client.query(`
      SELECT bot_id, telegram_user_id, chat_id FROM players
      WHERE bot_id = $1 AND telegram_user_id = $2
      FOR UPDATE
    `, [botId, normalizedPlayerId])).rows[0] || null;

    await client.query(`
      DELETE FROM scheduled_jobs
      WHERE bot_id = $1
        AND (payload ->> 'playerId' = $2 OR (payload -> 'playerIds') ? $2)
    `, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM analytics_events WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM purchases WHERE bot_id = $1 AND telegram_user_id = $2 AND status <> 'paid'`, [botId, normalizedPlayerId]);
    await client.query(`UPDATE players SET referrer_id = NULL, updated_at = NOW() WHERE bot_id = $1 AND referrer_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_promocodes WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_variables WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_inventory WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_relations WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_choices WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM player_achievements WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query(`DELETE FROM players WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, normalizedPlayerId]);
    await client.query('COMMIT');
    return player;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function recordNodeHistory(botId, playerId, nodeId, nodeType, nodeLabel) {
  await pool.query(
    `INSERT INTO player_node_history (bot_id, telegram_user_id, node_id, node_type, node_label) VALUES ($1, $2, $3, $4, $5)`,
    [botId, String(playerId), nodeId || '', nodeType || '', nodeLabel || '']
  );
  await pool.query(
    `DELETE FROM player_node_history WHERE bot_id = $1 AND telegram_user_id = $2
     AND id NOT IN (SELECT id FROM player_node_history WHERE bot_id = $1 AND telegram_user_id = $2 ORDER BY entered_at DESC LIMIT 15)`,
    [botId, String(playerId)]
  );
}

async function getNodeHistory(botId, playerId) {
  const result = await pool.query(
    `SELECT id, node_id, node_type, node_label, entered_at FROM player_node_history
     WHERE bot_id = $1 AND telegram_user_id = $2 ORDER BY entered_at DESC LIMIT 15`,
    [botId, String(playerId)]
  );
  return result.rows;
}

async function recordChoice(botId, playerId, nodeId, key, label) {
  await pool.query(`
    INSERT INTO player_choices (bot_id, telegram_user_id, node_id, choice_key, choice_label)
    VALUES ($1, $2, $3, $4, $5)
  `, [botId, String(playerId), nodeId || null, key || null, label || null]);
}

async function recordEvent(botId, playerId, eventType, nodeId, payload = {}) {
  await pool.query(`
    INSERT INTO analytics_events (bot_id, telegram_user_id, event_type, node_id, payload)
    VALUES ($1, $2, $3, $4, $5::jsonb)
  `, [botId, playerId ? String(playerId) : null, eventType, nodeId || null, JSON.stringify(payload)]);
}

async function loadBotVariables(botId) {
  const result = await pool.query(
    `SELECT var_name, var_type, value FROM bot_variables WHERE bot_id = $1 ORDER BY var_name`,
    [botId]
  );
  return Object.fromEntries(result.rows.map(r => [r.var_name, { type: r.var_type, value: r.value }]));
}

async function listBotVariables(botId) {
  const result = await pool.query(
    `SELECT var_name, var_type, value FROM bot_variables WHERE bot_id = $1 ORDER BY var_name`,
    [botId]
  );
  return result.rows.map(r => ({ name: r.var_name, type: r.var_type, value: r.value }));
}

async function setBotVariable(botId, name, type, value) {
  await pool.query(`
    INSERT INTO bot_variables (bot_id, var_name, var_type, value, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, NOW())
    ON CONFLICT (bot_id, var_name) DO UPDATE SET
      var_type = EXCLUDED.var_type, value = EXCLUDED.value, updated_at = NOW()
  `, [botId, name, type, JSON.stringify(value)]);
}

async function deleteBotVariable(botId, name) {
  await pool.query(`DELETE FROM bot_variables WHERE bot_id = $1 AND var_name = $2`, [botId, name]);
}

module.exports = {
  applyRewards,
  deleteInventoryItem,
  deleteAchievement,
  deletePlayer,
  deleteRelation,
  deleteVariable,
  ensurePlayer,
  listPlayers,
  loadPlayer,
  getNodeHistory,
  recordChoice,
  recordEvent,
  recordNodeHistory,
  redeemPromocode,
  resetPlayer,
  saveVariables,
  setBotVariable,
  setCurrentNode,
  setCheckpoint,
  setInventoryItem,
  setReferrer,
  setRelation,
  setVariable,
  unlockAchievement,
  deleteBotVariable,
  listBotVariables,
  loadBotVariables,
};
