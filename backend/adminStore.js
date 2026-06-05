/**
 * Codex developer notes:
 * Слой административных данных: промокоды, версии сценариев, бэкапы, задания рассылки, товары Stars и аналитика.
 * Функции возвращают готовые структуры для админ-панели и runtime, не смешивая SQL с React-кодом.
 * При расширении важно сохранять совместимость с существующими JSONB payload/rewards.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

const { v4: uuidv4 } = require('uuid');
const { createHash } = require('crypto');
const { pool } = require('./database');
const playerStore = require('./playerStore');

async function listPromocodes(botId) {
  return (await pool.query(`SELECT * FROM promocodes WHERE bot_id = $1 ORDER BY created_at DESC`, [botId])).rows;
}

async function savePromocode(botId, code, data = {}) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) throw new Error('Promocode is required');
  return (await pool.query(`
    INSERT INTO promocodes (bot_id, code, rewards, max_uses, active, expires_at, updated_at)
    VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW())
    ON CONFLICT (bot_id, code) DO UPDATE SET
      rewards = EXCLUDED.rewards, max_uses = EXCLUDED.max_uses, active = EXCLUDED.active,
      expires_at = EXCLUDED.expires_at, updated_at = NOW()
    RETURNING *
  `, [botId, normalized, JSON.stringify(data.rewards || {}), data.maxUses || null, data.active !== false, data.expiresAt || null])).rows[0];
}

async function deletePromocode(botId, code) {
  await pool.query(`DELETE FROM promocodes WHERE bot_id = $1 AND code = $2`, [botId, String(code).toUpperCase()]);
}

async function getAnalytics(botId) {
  const [events, nodes, choices, referrals, purchases, daily] = await Promise.all([
    pool.query(`SELECT event_type, COUNT(*)::int AS count FROM analytics_events WHERE bot_id = $1 GROUP BY event_type ORDER BY count DESC`, [botId]),
    pool.query(`SELECT node_id, COUNT(*)::int AS count FROM analytics_events WHERE bot_id = $1 AND event_type = 'node_enter' GROUP BY node_id ORDER BY count DESC LIMIT 100`, [botId]),
    pool.query(`SELECT node_id, choice_label, COUNT(*)::int AS count FROM player_choices WHERE bot_id = $1 GROUP BY node_id, choice_label ORDER BY count DESC LIMIT 100`, [botId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM players WHERE bot_id = $1 AND referrer_id IS NOT NULL`, [botId]),
    pool.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(price_stars), 0)::int AS stars FROM purchases WHERE bot_id = $1 AND status = 'paid'`, [botId]),
    pool.query(`SELECT created_at::date AS day, COUNT(*)::int AS count FROM analytics_events WHERE bot_id = $1 AND created_at >= NOW() - INTERVAL '30 days' GROUP BY created_at::date ORDER BY day`, [botId]),
  ]);
  return {
    events: events.rows,
    nodes: nodes.rows,
    choices: choices.rows,
    referrals: referrals.rows[0].count,
    purchases: purchases.rows[0],
    daily: daily.rows,
  };
}

async function listVersions(botId) {
  return (await pool.query(`SELECT id, version_number, status, rollout_percentage, created_at, published_at FROM scenario_versions WHERE bot_id = $1 ORDER BY version_number DESC`, [botId])).rows;
}

async function createVersion(botId, scenario) {
  const result = (await pool.query(`
    INSERT INTO scenario_versions (id, bot_id, version_number, scenario)
    SELECT $1, $2, COALESCE(MAX(version_number), 0) + 1, $3::jsonb FROM scenario_versions WHERE bot_id = $2
    RETURNING id, version_number, status, created_at, published_at
  `, [uuidv4(), botId, JSON.stringify(scenario)])).rows[0];
  await pool.query(`
    DELETE FROM scenario_versions
    WHERE bot_id = $1 AND status = 'archived' AND id NOT IN (
      SELECT id FROM scenario_versions WHERE bot_id = $1 ORDER BY version_number DESC LIMIT 50
    )
  `, [botId]);
  return result;
}

async function publishVersion(botId, versionId, rolloutPercentage = 100) {
  const rollout = Math.min(100, Math.max(1, +rolloutPercentage || 100));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (rollout === 100) {
      await client.query(`UPDATE scenario_versions SET status = 'archived' WHERE bot_id = $1 AND status = 'published'`, [botId]);
    }
    const result = await client.query(`
      UPDATE scenario_versions SET status = 'published', rollout_percentage = $3, published_at = NOW()
      WHERE bot_id = $1 AND id = $2 RETURNING *
    `, [botId, versionId, rollout]);
    if (!result.rows[0]) throw new Error('Version not found');
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function selectScenarioForPlayer(botId, playerId) {
  const versions = (await pool.query(`
    SELECT id, rollout_percentage, scenario FROM scenario_versions
    WHERE bot_id = $1 AND status = 'published'
    ORDER BY version_number DESC
  `, [botId])).rows;
  for (const version of versions) {
    const hash = createHash('sha256').update(`${botId}:${playerId}:${version.id}`).digest();
    const bucket = hash.readUInt32BE(0) % 100;
    if (bucket >= version.rollout_percentage) continue;
    await pool.query(`UPDATE players SET scenario_version_id = $3 WHERE bot_id = $1 AND telegram_user_id = $2`, [botId, String(playerId), version.id]);
    return version.scenario;
  }
  return null;
}

async function listBackups(botId) {
  return (await pool.query(`SELECT id, backup_type, created_at FROM backups WHERE bot_id = $1 ORDER BY created_at DESC LIMIT 100`, [botId])).rows;
}

async function getBackup(botId, backupId) {
  return (await pool.query(`SELECT * FROM backups WHERE bot_id = $1 AND id = $2`, [botId, backupId])).rows[0];
}

async function createBackup(botId, type, payload) {
  return (await pool.query(`
    INSERT INTO backups (id, bot_id, backup_type, payload) VALUES ($1, $2, $3, $4::jsonb)
    RETURNING id, backup_type, created_at
  `, [uuidv4(), botId, type || 'manual', JSON.stringify(payload)])).rows[0];
}

async function listJobs(botId) {
  return (await pool.query(`SELECT * FROM scheduled_jobs WHERE bot_id = $1 ORDER BY run_at DESC LIMIT 100`, [botId])).rows;
}

async function createJob(botId, type, runAt, payload = {}) {
  return (await pool.query(`
    INSERT INTO scheduled_jobs (bot_id, job_type, run_at, payload) VALUES ($1, $2, $3, $4::jsonb) RETURNING *
  `, [botId, type, runAt || new Date().toISOString(), JSON.stringify(payload)])).rows[0];
}

async function listRoles(botId) {
  return (await pool.query(`SELECT * FROM project_roles WHERE bot_id = $1 ORDER BY created_at DESC`, [botId])).rows;
}

async function saveRole(botId, userKey, role, comment = '') {
  if (!['owner', 'editor', 'viewer', 'denied'].includes(role)) throw new Error('Unsupported project role');
  return (await pool.query(`
    INSERT INTO project_roles (bot_id, user_key, role, comment) VALUES ($1, $2, $3, $4)
    ON CONFLICT (bot_id, user_key) DO UPDATE SET role = EXCLUDED.role, comment = EXCLUDED.comment
    RETURNING *
  `, [botId, userKey, role, String(comment || '').slice(0, 500)])).rows[0];
}

async function deleteRole(botId, userKey) {
  await pool.query(`DELETE FROM project_roles WHERE bot_id = $1 AND user_key = $2`, [botId, userKey]);
}

async function listProducts(botId) {
  return (await pool.query(`SELECT * FROM store_products WHERE bot_id = $1 ORDER BY created_at DESC`, [botId])).rows;
}

async function getProduct(botId, productKey) {
  return (await pool.query(`SELECT * FROM store_products WHERE bot_id = $1 AND product_key = $2 AND active = TRUE`, [botId, productKey])).rows[0];
}

async function saveProduct(botId, productKey, data = {}) {
  if (!productKey || !data.title || !(+data.priceStars > 0)) throw new Error('Product key, title and positive Stars price are required');
  return (await pool.query(`
    INSERT INTO store_products (bot_id, product_key, title, description, price_stars, rewards, active, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
    ON CONFLICT (bot_id, product_key) DO UPDATE SET
      title = EXCLUDED.title, description = EXCLUDED.description, price_stars = EXCLUDED.price_stars,
      rewards = EXCLUDED.rewards, active = EXCLUDED.active, updated_at = NOW()
    RETURNING *
  `, [botId, productKey, data.title, data.description || '', +data.priceStars, JSON.stringify(data.rewards || {}), data.active !== false])).rows[0];
}

async function deleteProduct(botId, productKey) {
  await pool.query(`DELETE FROM store_products WHERE bot_id = $1 AND product_key = $2`, [botId, productKey]);
}

async function createPurchase(botId, playerId, product) {
  const id = uuidv4();
  await pool.query(`
    INSERT INTO purchases (id, bot_id, telegram_user_id, product_key, price_stars)
    VALUES ($1, $2, $3, $4, $5)
  `, [id, botId, String(playerId), product.product_key, product.price_stars]);
  return id;
}

async function completePurchase(botId, playerId, purchaseId, payment = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT p.*, s.rewards FROM purchases p
      JOIN store_products s ON s.bot_id = p.bot_id AND s.product_key = p.product_key
      WHERE p.bot_id = $1 AND p.telegram_user_id = $2 AND p.id = $3 FOR UPDATE
    `, [botId, String(playerId), purchaseId]);
    const purchase = result.rows[0];
    if (!purchase) throw new Error('Purchase not found');
    if (purchase.status !== 'paid') {
      await playerStore.applyRewards(client, botId, playerId, purchase.rewards);
      await client.query(`
        UPDATE purchases SET status = 'paid', telegram_payment_charge_id = $4,
          provider_payment_charge_id = $5, payload = $6::jsonb, completed_at = NOW()
        WHERE bot_id = $1 AND telegram_user_id = $2 AND id = $3
      `, [botId, String(playerId), purchaseId, payment.telegram_payment_charge_id || null, payment.provider_payment_charge_id || null, JSON.stringify(payment)]);
    }
    await client.query('COMMIT');
    return purchase;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  completePurchase,
  createBackup,
  createJob,
  createPurchase,
  createVersion,
  deleteProduct,
  deletePromocode,
  deleteRole,
  getAnalytics,
  getBackup,
  getProduct,
  listBackups,
  listJobs,
  listProducts,
  listPromocodes,
  listRoles,
  listVersions,
  publishVersion,
  saveProduct,
  savePromocode,
  saveRole,
  selectScenarioForPlayer,
};
