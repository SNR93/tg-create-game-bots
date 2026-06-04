const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://tgbot:tgbot@localhost:5433/tgbot',
});

pool.on('error', error => {
  console.error('PostgreSQL pool connection error:', error.message);
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      bot_id TEXT NOT NULL,
      telegram_user_id TEXT NOT NULL,
      chat_id TEXT,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      current_node_id TEXT,
      checkpoint_node_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, telegram_user_id)
    );

    ALTER TABLE players ADD COLUMN IF NOT EXISTS referrer_id TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS scenario_version_id TEXT;

    CREATE TABLE IF NOT EXISTS player_variables (
      bot_id TEXT NOT NULL,
      telegram_user_id TEXT NOT NULL,
      var_name TEXT NOT NULL,
      var_type TEXT NOT NULL CHECK (var_type IN ('boolean', 'number', 'text')),
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, telegram_user_id, var_name),
      FOREIGN KEY (bot_id, telegram_user_id) REFERENCES players(bot_id, telegram_user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_inventory (
      bot_id TEXT NOT NULL,
      telegram_user_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, telegram_user_id, item_key),
      FOREIGN KEY (bot_id, telegram_user_id) REFERENCES players(bot_id, telegram_user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_relations (
      bot_id TEXT NOT NULL,
      telegram_user_id TEXT NOT NULL,
      character_key TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, telegram_user_id, character_key),
      FOREIGN KEY (bot_id, telegram_user_id) REFERENCES players(bot_id, telegram_user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_choices (
      id BIGSERIAL PRIMARY KEY,
      bot_id TEXT NOT NULL,
      telegram_user_id TEXT NOT NULL,
      node_id TEXT,
      choice_key TEXT,
      choice_label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (bot_id, telegram_user_id) REFERENCES players(bot_id, telegram_user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_achievements (
      bot_id TEXT NOT NULL,
      telegram_user_id TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, telegram_user_id, achievement_key),
      FOREIGN KEY (bot_id, telegram_user_id) REFERENCES players(bot_id, telegram_user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS promocodes (
      bot_id TEXT NOT NULL,
      code TEXT NOT NULL,
      rewards JSONB NOT NULL DEFAULT '{}'::jsonb,
      max_uses INTEGER,
      uses INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, code)
    );

    CREATE TABLE IF NOT EXISTS player_promocodes (
      bot_id TEXT NOT NULL,
      telegram_user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, telegram_user_id, code),
      FOREIGN KEY (bot_id, telegram_user_id) REFERENCES players(bot_id, telegram_user_id) ON DELETE CASCADE,
      FOREIGN KEY (bot_id, code) REFERENCES promocodes(bot_id, code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGSERIAL PRIMARY KEY,
      bot_id TEXT NOT NULL,
      telegram_user_id TEXT,
      event_type TEXT NOT NULL,
      node_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scenario_versions (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      scenario JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at TIMESTAMPTZ,
      UNIQUE (bot_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id BIGSERIAL PRIMARY KEY,
      bot_id TEXT NOT NULL,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      run_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE scenario_versions ADD COLUMN IF NOT EXISTS rollout_percentage INTEGER NOT NULL DEFAULT 100;

    CREATE TABLE IF NOT EXISTS project_roles (
      bot_id TEXT NOT NULL,
      user_key TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, user_key)
    );

    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      backup_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS store_products (
      bot_id TEXT NOT NULL,
      product_key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_stars INTEGER NOT NULL CHECK (price_stars > 0),
      rewards JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, product_key)
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      telegram_user_id TEXT NOT NULL,
      product_key TEXT NOT NULL,
      price_stars INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      telegram_payment_charge_id TEXT,
      provider_payment_charge_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      FOREIGN KEY (bot_id, product_key) REFERENCES store_products(bot_id, product_key)
    );

    ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_bot_id_telegram_user_id_fkey;

    CREATE TABLE IF NOT EXISTS bot_variables (
      bot_id TEXT NOT NULL,
      var_name TEXT NOT NULL,
      var_type TEXT NOT NULL CHECK (var_type IN ('boolean', 'number', 'text')),
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, var_name)
    );

    CREATE INDEX IF NOT EXISTS idx_players_bot_updated ON players(bot_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_choices_player ON player_choices(bot_id, telegram_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_bot_type ON analytics_events(bot_id, event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_bot_created ON analytics_events(bot_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_pending ON scheduled_jobs(status, run_at);
    CREATE INDEX IF NOT EXISTS idx_purchases_player ON purchases(bot_id, telegram_user_id, created_at DESC);
  `);

  // Migrate project_roles: add comment column and expand role CHECK to include 'denied'
  await pool.query(`ALTER TABLE project_roles ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT ''`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE project_roles DROP CONSTRAINT project_roles_role_check;
    EXCEPTION WHEN undefined_object THEN NULL; END $$;
    ALTER TABLE project_roles ADD CONSTRAINT project_roles_role_check
      CHECK (role IN ('owner', 'editor', 'viewer', 'denied'));
  `);
}

module.exports = { pool, initDatabase };
