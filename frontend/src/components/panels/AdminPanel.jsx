import React, { useCallback, useEffect, useState } from 'react';
import {
  createBotPlayer,
  createBotBackup,
  createBotJob,
  createBotVersion,
  deleteBotPlayer,
  deleteBotPlayerInventoryItem,
  deleteBotPlayerVariable,
  deleteBotPlayerAchievement,
  deleteBotPlayerRelation,
  deleteBotProduct,
  deleteBotPromocode,
  deleteBotRole,
  getBotAnalytics,
  getBotPlayer,
  listBotPlayers,
  listBotBackups,
  listBotJobs,
  listBotProducts,
  listBotPromocodes,
  listBotRoles,
  listBotVersions,
  publishBotVersion,
  resetBotPlayer,
  restoreBotBackup,
  setBotPlayerInventoryItem,
  setBotPlayerAchievement,
  setBotPlayerRelation,
  setBotPlayerVariable,
  saveBotProduct,
  saveBotPromocode,
  saveBotRole,
} from '../../api';
import CountedInput from '../inspector/CountedInput';
import { TELEGRAM_LIMITS } from '../../telegramLimits';

function displayName(player) {
  return player.username ? `@${player.username}` : player.first_name || player.telegram_user_id;
}

function parseValue(type, value) {
  if (type === 'number') return Number(value) || 0;
  if (type === 'boolean') return value === true || value === 'true';
  return String(value ?? '');
}

export default function AdminPanel({ botId, onClose }) {
  const [tab, setTab] = useState('players');
  const [players, setPlayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [player, setPlayer] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newPlayerId, setNewPlayerId] = useState('');

  const loadPlayers = useCallback(async () => {
    setError('');
    try {
      setPlayers(await listBotPlayers(botId, query));
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [botId, query]);

  const loadPlayer = useCallback(async id => {
    if (!id) return setPlayer(null);
    setError('');
    try {
      setPlayer(await getBotPlayer(botId, id));
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [botId]);

  useEffect(() => {
    const timer = setTimeout(loadPlayers, 150);
    return () => clearTimeout(timer);
  }, [loadPlayers]);

  useEffect(() => {
    loadPlayer(selectedId);
  }, [loadPlayer, selectedId]);

  async function run(action, refreshList = false) {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (result?.telegram_user_id) setPlayer(result);
      if (refreshList) await loadPlayers();
      return result;
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  async function addPlayer(event) {
    event.preventDefault();
    const playerId = newPlayerId.trim();
    if (!playerId) return;
    const created = await run(() => createBotPlayer(botId, { playerId }), true);
    if (created) {
      setNewPlayerId('');
      setSelectedId(created.telegram_user_id);
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.panel}>
        <div style={s.header}>
          <div>
            <div style={s.title}>Админ-панель</div>
            <div style={s.subtitle}>Игроки, переменные, инвентарь и журнал выборов</div>
          </div>
          <button style={s.close} onClick={onClose}>×</button>
        </div>

        {error && <div style={s.error}>{error}</div>}
        <div style={s.tabs}>
          {[
            ['players', 'Игроки'], ['promocodes', 'Промокоды'], ['products', 'Магазин Stars'],
            ['analytics', 'Аналитика'], ['versions', 'Версии'], ['backups', 'Резервные копии'], ['jobs', 'Очередь'], ['roles', 'Роли'],
          ].map(([key, label]) => <button key={key} style={{ ...s.tab, ...(tab === key ? s.tabActive : {}) }} onClick={() => setTab(key)}>{label}</button>)}
        </div>

        {tab === 'players' ? <div style={s.body}>
          <div style={s.sidebar}>
            <input style={s.search} value={query} placeholder="Поиск игрока..." onChange={event => setQuery(event.target.value)} />
            <form style={s.addPlayer} onSubmit={addPlayer}>
              <input style={s.search} value={newPlayerId} placeholder="Telegram ID нового игрока" onChange={event => setNewPlayerId(event.target.value)} />
              <button style={s.primary} disabled={busy}>Добавить</button>
            </form>
            <div style={s.list}>
              {players.length === 0 && <div style={s.empty}>Игроков пока нет.</div>}
              {players.map(entry => (
                <button key={entry.telegram_user_id}
                  style={{ ...s.playerButton, borderColor: selectedId === entry.telegram_user_id ? '#3b82f6' : '#2d3458' }}
                  onClick={() => setSelectedId(entry.telegram_user_id)}>
                  <span style={s.playerName}>{displayName(entry)}</span>
                  <span style={s.playerMeta}>ID {entry.telegram_user_id}</span>
                  <span style={s.playerMeta}>Инвентарь: {entry.inventory_items} · Выборы: {entry.choices_count}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={s.content}>
            {!player ? (
              <div style={s.placeholder}>Выберите игрока слева.</div>
            ) : (
              <>
                <div style={s.playerHeader}>
                  <div>
                    <div style={s.playerTitle}>{displayName(player)}</div>
                    <div style={s.playerMeta}>Telegram ID: {player.telegram_user_id} · текущая нода: {player.current_node_id || 'нет'}</div>
                    <div style={s.playerMeta}>Реферал от: {player.referrer_id || 'нет'} · версия: {player.scenario_version_id || 'текущий черновик'}</div>
                  </div>
                  <button style={s.secondary} disabled={busy} onClick={() => run(() => resetBotPlayer(botId, player.telegram_user_id), true)}>Сбросить прогресс</button>
                  <button style={s.danger} disabled={busy} onClick={async () => {
                    if (!confirm('Удалить игрока и весь его прогресс?')) return;
                    await run(() => deleteBotPlayer(botId, player.telegram_user_id), true);
                    setSelectedId(null);
                    setPlayer(null);
                  }}>Удалить</button>
                </div>

                <VariableSection botId={botId} player={player} busy={busy} run={run} />
                <InventorySection botId={botId} player={player} busy={busy} run={run} />
                <RelationSection botId={botId} player={player} busy={busy} run={run} />
                <AchievementSection botId={botId} player={player} busy={busy} run={run} />

                <Section title={`Журнал выборов (${player.choices.length})`}>
                  {player.choices.length === 0 && <div style={s.empty}>Выборов пока нет.</div>}
                  {player.choices.map(choice => (
                    <div key={choice.id} style={s.logRow}>
                      <span style={s.logTime}>{new Date(choice.created_at).toLocaleString('ru')}</span>
                      <span style={s.logText}>{choice.choice_label || choice.choice_key}</span>
                      <span style={s.logNode}>{choice.node_id || ''}</span>
                    </div>
                  ))}
                </Section>
              </>
            )}
          </div>
        </div> : <ManagementPanel botId={botId} tab={tab} setError={setError} />}
      </div>
    </div>
  );
}

function VariableSection({ botId, player, busy, run }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('number');
  const [value, setValue] = useState('0');

  return (
    <Section title="Переменные">
      {Object.entries(player.variables).map(([varName, variable]) => (
        <form key={varName} style={s.editRow} onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(() => setBotPlayerVariable(botId, player.telegram_user_id, varName, {
            type: form.get('type'),
            value: parseValue(form.get('type'), form.get('value')),
          }));
        }}>
          <span style={s.key}>{varName}</span>
          <select name="type" defaultValue={variable.type} style={s.select}>
            <option value="number">число</option>
            <option value="boolean">логика</option>
            <option value="text">текст</option>
          </select>
          <input name="value" defaultValue={String(variable.value)} style={s.smallInput} />
          <button style={s.save} disabled={busy}>Сохранить</button>
          <button type="button" style={s.iconDanger} onClick={() => run(() => deleteBotPlayerVariable(botId, player.telegram_user_id, varName))}>×</button>
        </form>
      ))}
      <form style={s.createRow} onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) return;
        run(() => setBotPlayerVariable(botId, player.telegram_user_id, name.trim(), { type, value: parseValue(type, value) }));
        setName('');
      }}>
        <input style={s.smallInput} placeholder="Новая переменная" value={name} onChange={event => setName(event.target.value)} />
        <select style={s.select} value={type} onChange={event => setType(event.target.value)}>
          <option value="number">число</option>
          <option value="boolean">логика</option>
          <option value="text">текст</option>
        </select>
        <input style={s.smallInput} value={value} onChange={event => setValue(event.target.value)} />
        <button style={s.primary} disabled={busy}>Добавить</button>
      </form>
    </Section>
  );
}

function InventorySection({ botId, player, busy, run }) {
  const [itemKey, setItemKey] = useState('');
  const [quantity, setQuantity] = useState(1);

  return (
    <Section title="Инвентарь">
      {player.inventory.map(item => (
        <form key={item.item_key} style={s.editRow} onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(() => setBotPlayerInventoryItem(botId, player.telegram_user_id, item.item_key, { quantity: +form.get('quantity') }));
        }}>
          <span style={s.key}>{item.item_key}</span>
          <input name="quantity" type="number" min="0" defaultValue={item.quantity} style={s.quantity} />
          <button style={s.save} disabled={busy}>Сохранить</button>
          <button type="button" style={s.iconDanger} onClick={() => run(() => deleteBotPlayerInventoryItem(botId, player.telegram_user_id, item.item_key))}>×</button>
        </form>
      ))}
      <form style={s.createRow} onSubmit={event => {
        event.preventDefault();
        if (!itemKey.trim()) return;
        run(() => setBotPlayerInventoryItem(botId, player.telegram_user_id, itemKey.trim(), { quantity: +quantity }));
        setItemKey('');
        setQuantity(1);
      }}>
        <input style={s.smallInput} placeholder="Новый предмет" value={itemKey} onChange={event => setItemKey(event.target.value)} />
        <input style={s.quantity} type="number" min="1" value={quantity} onChange={event => setQuantity(event.target.value)} />
        <button style={s.primary} disabled={busy}>Добавить</button>
      </form>
    </Section>
  );
}

function RelationSection({ botId, player, busy, run }) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState(0);
  return <Section title="Отношения с персонажами">
    {player.relations.map(item => <div key={item.character_key} style={s.editRow}>
      <span style={s.key}>{item.character_key}</span><span style={s.playerMeta}>{item.value}</span>
      <button style={s.iconDanger} onClick={() => run(() => deleteBotPlayerRelation(botId, player.telegram_user_id, item.character_key))}>×</button>
    </div>)}
    <form style={s.createRow} onSubmit={event => { event.preventDefault(); if (!key.trim()) return; run(() => setBotPlayerRelation(botId, player.telegram_user_id, key.trim(), { value: +value })); setKey(''); }}>
      <input style={s.smallInput} placeholder="Персонаж" value={key} onChange={event => setKey(event.target.value)} />
      <input style={s.quantity} type="number" value={value} onChange={event => setValue(event.target.value)} />
      <button style={s.primary} disabled={busy}>Добавить</button>
    </form>
  </Section>;
}

function AchievementSection({ botId, player, busy, run }) {
  const [key, setKey] = useState('');
  return <Section title="Достижения">
    {player.achievements.map(item => <div key={item.achievement_key} style={s.editRow}>
      <span style={s.key}>{item.achievement_key}</span><span style={s.playerMeta}>{new Date(item.unlocked_at).toLocaleString('ru')}</span>
      <button style={s.iconDanger} onClick={() => run(() => deleteBotPlayerAchievement(botId, player.telegram_user_id, item.achievement_key))}>×</button>
    </div>)}
    <form style={s.createRow} onSubmit={event => { event.preventDefault(); if (!key.trim()) return; run(() => setBotPlayerAchievement(botId, player.telegram_user_id, key.trim())); setKey(''); }}>
      <input style={s.smallInput} placeholder="Ключ достижения" value={key} onChange={event => setKey(event.target.value)} />
      <button style={s.primary} disabled={busy}>Выдать</button>
    </form>
  </Section>;
}

function ManagementPanel({ botId, tab, setError }) {
  const [items, setItems] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [form, setForm] = useState({});
  const loaders = { promocodes: listBotPromocodes, products: listBotProducts, analytics: getBotAnalytics, versions: listBotVersions, backups: listBotBackups, jobs: listBotJobs, roles: listBotRoles };
  const load = useCallback(async () => {
    try {
      setError('');
      const result = await loaders[tab](botId);
      if (tab === 'analytics') setAnalytics(result); else setItems(result);
    } catch (error) { setError(error.message); }
  }, [botId, tab, setError]);
  useEffect(() => { load(); }, [load]);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const execute = async action => { try { setError(''); await action(); setForm({}); await load(); } catch (error) { setError(error.message); } };

  if (tab === 'analytics') return <div style={s.management}>
    <AnalyticsPanel analytics={analytics} />
  </div>;

  if (tab === 'promocodes') return <div style={s.management}>
    <Section title="Новый промокод">
      <form style={s.createRow} onSubmit={event => { event.preventDefault(); execute(() => saveBotPromocode(botId, form.code, { rewards: JSON.parse(form.rewards || '{}'), maxUses: +form.maxUses || null })); }}>
        <input style={s.smallInput} placeholder="CODE" value={form.code || ''} onChange={event => update('code', event.target.value)} />
        <input style={s.smallInput} placeholder='Награды JSON: {"inventory":{"key":1}}' value={form.rewards || ''} onChange={event => update('rewards', event.target.value)} />
        <input style={s.quantity} type="number" min="0" placeholder="Лимит" value={form.maxUses || ''} onChange={event => update('maxUses', event.target.value)} />
        <button style={s.primary}>Добавить</button>
      </form>
    </Section>
    <SimpleRows items={items} title="Промокоды" render={item => `${item.code} · ${item.uses}/${item.max_uses ?? '∞'}`} onDelete={item => execute(() => deleteBotPromocode(botId, item.code))} />
  </div>;

  if (tab === 'products') return <div style={s.management}>
    <Section title="Товар Telegram Stars">
      <form style={s.createRow} onSubmit={event => { event.preventDefault(); execute(() => saveBotProduct(botId, form.key, { title: form.title, description: form.description, priceStars: +form.priceStars, rewards: JSON.parse(form.rewards || '{}') })); }}>
        <input style={s.smallInput} placeholder="Ключ" value={form.key || ''} onChange={event => update('key', event.target.value)} />
        <CountedInput style={s.smallInput} placeholder="Название" value={form.title || ''} maxLength={TELEGRAM_LIMITS.invoiceTitle} onChange={event => update('title', event.target.value)} />
        <input style={s.quantity} type="number" min="1" placeholder="Stars" value={form.priceStars || ''} onChange={event => update('priceStars', event.target.value)} />
        <input style={s.smallInput} placeholder="Награды JSON" value={form.rewards || ''} onChange={event => update('rewards', event.target.value)} />
        <button style={s.primary}>Сохранить</button>
      </form>
    </Section>
    <SimpleRows items={items} title="Товары" render={item => `${item.title} · ${item.price_stars} Stars · ${item.product_key}`} onDelete={item => execute(() => deleteBotProduct(botId, item.product_key))} />
  </div>;

  if (tab === 'versions') return <div style={s.management}>
    <button style={s.primary} onClick={() => execute(() => createBotVersion(botId))}>Создать снимок версии</button>
    <div style={{ ...s.metric, marginTop: 8 }}>Rollout задаёт долю игроков, которые получат новую версию при следующем /start. Прогресс не сбрасывается.</div>
    <SimpleRows items={items} title="Версии сценария" render={item => `v${item.version_number} · ${item.status} · rollout ${item.rollout_percentage}% · ${new Date(item.created_at).toLocaleString('ru')}`} action={(item) => item.status !== 'published' && <>
      <input style={s.quantity} type="number" min="1" max="100" value={form.rollout || 100} onChange={event => update('rollout', event.target.value)} />
      <button style={s.save} onClick={() => execute(() => publishBotVersion(botId, item.id, +form.rollout || 100))}>Опубликовать</button>
    </>} />
  </div>;

  if (tab === 'backups') return <div style={s.management}>
    <button style={s.primary} onClick={() => execute(() => createBotBackup(botId))}>Создать резервную копию</button>
    <SimpleRows items={items} title="Резервные копии" render={item => `${item.backup_type} · ${new Date(item.created_at).toLocaleString('ru')}`} action={item => <button style={s.save} onClick={() => confirm('Восстановить сценарий из этой копии?') && execute(() => restoreBotBackup(botId, item.id))}>Восстановить</button>} />
  </div>;

  if (tab === 'roles') return <div style={s.management}>
    <Section title="Роль пользователя проекта">
      <form style={s.createRow} onSubmit={event => { event.preventDefault(); execute(() => saveBotRole(botId, form.userKey, form.role || 'viewer')); }}>
        <input style={s.smallInput} placeholder="Логин или ID" value={form.userKey || ''} onChange={event => update('userKey', event.target.value)} />
        <select style={s.select} value={form.role || 'viewer'} onChange={event => update('role', event.target.value)}><option value="owner">owner</option><option value="editor">editor</option><option value="viewer">viewer</option></select>
        <button style={s.primary}>Сохранить</button>
      </form>
    </Section>
    <SimpleRows items={items} title="Роли проекта" render={item => `${item.user_key} · ${item.role}`} onDelete={item => execute(() => deleteBotRole(botId, item.user_key))} />
  </div>;

  return <div style={s.management}>
    <Section title="Запланировать рассылку">
      <form style={s.createRow} onSubmit={event => { event.preventDefault(); execute(() => createBotJob(botId, { type: 'broadcast', runAt: form.runAt || new Date().toISOString(), payload: { text: form.text || '' } })); }}>
        <CountedInput style={s.smallInput} placeholder="Текст рассылки" value={form.text || ''} maxLength={TELEGRAM_LIMITS.messageText} onChange={event => update('text', event.target.value)} />
        <input style={s.smallInput} type="datetime-local" value={form.runAt || ''} onChange={event => update('runAt', event.target.value)} />
        <button style={s.primary}>Поставить в очередь</button>
      </form>
    </Section>
    <SimpleRows items={items} title="Задачи" render={item => `${item.job_type} · ${item.status} · ${new Date(item.run_at).toLocaleString('ru')}${item.last_error ? ` · ${item.last_error}` : ''}`} />
  </div>;
}

function BarChart({ items = [], labelFn, maxBars = 15 }) {
  const top = items.slice(0, maxBars);
  const maxCount = Math.max(1, ...top.map(item => item.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {top.map((item, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 180, fontSize: 11, color: '#a0aec0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
            {labelFn(item)}
          </div>
          <div style={{ flex: 1, height: 14, background: 'rgba(56,189,248,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(item.count / maxCount) * 100}%`, background: '#38bdf8', borderRadius: 3, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: '#718096', width: 36, textAlign: 'right', flexShrink: 0 }}>{item.count}</div>
        </div>
      ))}
      {items.length === 0 && <div style={s.empty}>Нет данных</div>}
    </div>
  );
}

function FunnelChart({ events = [] }) {
  const order = ['scenario_start', 'keyboard_choice', 'achievement_unlocked', 'purchase_paid', 'scenario_complete'];
  const map = Object.fromEntries(events.map(e => [e.event_type, e.count]));
  const maxVal = Math.max(1, ...order.map(k => map[k] || 0));
  const labels = {
    scenario_start: 'Начали игру',
    keyboard_choice: 'Сделали выбор',
    achievement_unlocked: 'Получили достижение',
    purchase_paid: 'Оплатили',
    scenario_complete: 'Прошли сценарий',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {order.map((key, idx) => {
        const count = map[key] || 0;
        const pct = Math.round((count / maxVal) * 100);
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#1a2535', border: '1px solid #2d3458', color: '#718096', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</div>
            <div style={{ width: 150, fontSize: 11, color: '#a0aec0', flexShrink: 0 }}>{labels[key]}</div>
            <div style={{ flex: 1, height: 18, background: 'rgba(56,189,248,0.08)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `rgba(56,189,248,${0.3 + 0.7 * (1 - idx * 0.15)})`, borderRadius: 4, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontSize: 11, color: '#718096', width: 54, textAlign: 'right', flexShrink: 0 }}>{count} ({pct}%)</div>
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsPanel({ analytics }) {
  if (!analytics) return <div style={s.empty}>Загрузка...</div>;
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 2 }}>
        <div style={s.statCard}>
          <div style={s.statVal}>{analytics.referrals || 0}</div>
          <div style={s.statLabel}>Реферальные игроки</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statVal}>{analytics.purchases?.count || 0}</div>
          <div style={s.statLabel}>Оплат</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statVal}>⭐ {analytics.purchases?.stars || 0}</div>
          <div style={s.statLabel}>Stars заработано</div>
        </div>
      </div>

      <Section title="Воронка конверсии">
        <FunnelChart events={analytics.events || []} />
      </Section>

      <Section title={`Топ посещаемых нод (${(analytics.nodes || []).length})`}>
        <BarChart items={analytics.nodes || []} labelFn={item => item.node_id || 'нет ID'} />
      </Section>

      <Section title={`Популярные выборы игроков (${(analytics.choices || []).length})`}>
        <BarChart items={analytics.choices || []} labelFn={item => item.choice_label || '?'} maxBars={20} />
      </Section>

      <Section title="Все события">
        <BarChart items={analytics.events || []} labelFn={item => item.event_type} />
      </Section>
    </>
  );
}

function StatSection({ title, items = [], label }) {
  return <Section title={title}>{items.map((item, index) => <div key={index} style={s.editRow}><span style={s.key}>{label(item)}</span><span style={s.metric}>{item.count}</span></div>)}</Section>;
}

function SimpleRows({ title, items = [], render, onDelete, action }) {
  return <Section title={title}>{items.length === 0 && <div style={s.empty}>Пока пусто.</div>}{items.map((item, index) => <div key={item.id || item.code || item.product_key || index} style={s.editRow}><span style={s.key}>{render(item)}</span>{action?.(item)}{onDelete && <button style={s.iconDanger} onClick={() => onDelete(item)}>×</button>}</div>)}</Section>;
}

function Section({ title, children }) {
  return <section style={s.section}><div style={s.sectionTitle}>{title}</div>{children}</section>;
}

const s = {
  overlay: { position: 'fixed', inset: 0, zIndex: 240, background: 'rgba(0,0,0,0.78)', padding: 20 },
  panel: { height: '100%', background: '#12131a', border: '1px solid #2d3458', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#1a1c2a', borderBottom: '1px solid #2d3458' },
  title: { color: '#e2e8f0', fontWeight: 700, fontSize: 18 },
  subtitle: { color: '#718096', fontSize: 12, marginTop: 2 },
  close: { background: 'transparent', border: 'none', color: '#a0aec0', fontSize: 27, cursor: 'pointer' },
  error: { color: '#fc8181', background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.25)', padding: '8px 14px', fontSize: 12 },
  tabs: { display: 'flex', gap: 4, padding: '7px 10px', borderBottom: '1px solid #2d3458', background: '#161824', overflowX: 'auto' },
  tab: { background: 'transparent', border: '1px solid transparent', borderRadius: 5, color: '#a0aec0', padding: '6px 9px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  tabActive: { background: '#252a42', borderColor: '#3b82f6', color: '#e2e8f0' },
  body: { flex: 1, display: 'flex', minHeight: 0 },
  sidebar: { width: 260, flexShrink: 0, borderRight: '1px solid #2d3458', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  search: { boxSizing: 'border-box', width: '100%', background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', padding: '7px 9px', fontSize: 12, outline: 'none' },
  addPlayer: { display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 8, borderBottom: '1px solid #2d3458' },
  list: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 },
  playerButton: { display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', background: '#1a1c2a', border: '1px solid', borderRadius: 7, padding: '8px 9px', cursor: 'pointer' },
  playerName: { color: '#e2e8f0', fontWeight: 700, fontSize: 12 },
  playerMeta: { color: '#718096', fontSize: 11 },
  content: { flex: 1, overflowY: 'auto', padding: 14 },
  management: { flex: 1, overflowY: 'auto', padding: 14 },
  placeholder: { color: '#718096', textAlign: 'center', paddingTop: 80 },
  playerHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px 14px' },
  playerTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: 700 },
  section: { background: '#1a1c2a', border: '1px solid #2d3458', borderRadius: 8, padding: 10, marginBottom: 10 },
  sectionTitle: { color: '#a0aec0', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  editRow: { display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid #222436', padding: '6px 0' },
  createRow: { display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid #2d3458', paddingTop: 8, marginTop: 4 },
  key: { color: '#a78bfa', fontWeight: 600, fontSize: 12, flex: 1 },
  select: { background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#cbd5e0', padding: '5px 6px', fontSize: 12 },
  smallInput: { flex: 1, minWidth: 80, background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', padding: '5px 7px', fontSize: 12, outline: 'none' },
  quantity: { width: 65, background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', padding: '5px 7px', fontSize: 12 },
  primary: { background: '#2563eb', border: 'none', borderRadius: 5, color: '#fff', padding: '6px 9px', fontSize: 12, cursor: 'pointer' },
  save: { background: '#166534', border: 'none', borderRadius: 5, color: '#fff', padding: '5px 8px', fontSize: 11, cursor: 'pointer' },
  secondary: { marginLeft: 'auto', background: '#2a2d3e', border: '1px solid #3a3f55', borderRadius: 5, color: '#cbd5e0', padding: '6px 9px', fontSize: 12, cursor: 'pointer' },
  danger: { background: '#991b1b', border: 'none', borderRadius: 5, color: '#fff', padding: '6px 9px', fontSize: 12, cursor: 'pointer' },
  iconDanger: { background: 'transparent', border: 'none', color: '#fc8181', fontSize: 16, cursor: 'pointer' },
  logRow: { display: 'flex', gap: 10, padding: '5px 0', borderTop: '1px solid #222436', fontSize: 12 },
  logTime: { color: '#718096', width: 145, flexShrink: 0 },
  logText: { color: '#e2e8f0', flex: 1 },
  logNode: { color: '#4a5568', fontFamily: 'monospace' },
  empty: { color: '#4a5568', fontSize: 12, padding: '8px 0' },
  metric: { color: '#cbd5e0', fontSize: 12, marginBottom: 5 },
  statCard: { flex: 1, background: '#1a1c2a', border: '1px solid #2d3458', borderRadius: 8, padding: '10px 14px', textAlign: 'center', marginBottom: 10 },
  statVal: { color: '#38bdf8', fontSize: 22, fontWeight: 700 },
  statLabel: { color: '#718096', fontSize: 11, marginTop: 2 },
};
