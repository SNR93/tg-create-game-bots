/**
 * Redis-backed session store with in-memory Map fallback.
 *
 * Sessions are stored per-bot to avoid cross-bot key collisions.
 * The `bot` field (full node graph) is excluded from persistence to keep
 * Redis entries small; it is reloaded from disk on first access after restart.
 *
 * If Redis is unavailable the store falls back to an in-process Map, which is
 * the same behaviour as before this module existed.
 */

const SESSION_TTL_SECONDS = 86400; // 24 h

function createSessionStore(botId) {
  const prefix = `tgbot:${botId}:session:`;
  const memoryStore = new Map();
  let redis = null;

  try {
    const Redis = require('ioredis');
    const url = process.env.REDIS_URL || 'redis://redis:6379';
    redis = new Redis(url, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    // suppress connection-error noise — we just fall back to Map
    redis.on('error', () => {});
  } catch {
    redis = null;
  }

  function key(chatId) {
    return `${prefix}${chatId}`;
  }

  function serialize(session) {
    // strip the bot graph — reloaded from disk when needed
    const { bot: _bot, ...rest } = session;
    return JSON.stringify(rest);
  }

  function deserialize(data) {
    const session = JSON.parse(data);
    session.bot = null; // caller must reload from disk if null
    return session;
  }

  async function get(chatId) {
    const k = key(chatId);
    // In-memory cache first (set during current request lifecycle)
    if (memoryStore.has(k)) return memoryStore.get(k);
    if (redis) {
      try {
        const data = await redis.get(k);
        if (data) {
          const session = deserialize(data);
          memoryStore.set(k, session);
          return session;
        }
        return null;
      } catch {
        // Redis error — fall through to memory (no data = null)
      }
    }
    return null;
  }

  function set(chatId, session) {
    // Sync update of local cache — persist to Redis asynchronously
    memoryStore.set(key(chatId), session);
  }

  async function persist(chatId) {
    const session = memoryStore.get(key(chatId));
    if (!session || !redis) return;
    try {
      await redis.setex(key(chatId), SESSION_TTL_SECONDS, serialize(session));
    } catch {
      // Redis write failed — session lives only in memory until next restart
    }
  }

  function has(chatId) {
    return memoryStore.has(key(chatId));
  }

  async function del(chatId) {
    memoryStore.delete(key(chatId));
    if (redis) {
      try {
        await redis.del(key(chatId));
      } catch {}
    }
  }

  function close() {
    redis?.disconnect();
  }

  return { get, set, persist, has, del, close };
}

module.exports = { createSessionStore };
