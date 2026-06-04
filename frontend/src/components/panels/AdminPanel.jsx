import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  createBotPlayer,
  createBotBackup,
  createBotJob,
  createBotVersion,
  deleteBotGlobal,
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
  listBotGlobals,
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
  setBotGlobal,
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
import { getBot } from '../../api';

function extractBotSuggestions(nodes) {
  const variables = {};
  const inventoryKeys = new Set();
  const characterKeys = new Set();
  const achievementKeys = new Set();
  for (const node of nodes || []) {
    if (node.type === 'variableNode') {
      for (const e of node.data?.entries || []) {
        if (e.varName) variables[e.varName] = { type: e.varType || 'boolean' };
      }
    }
    if (node.type === 'textInputNode' && node.data?.varName) {
      variables[node.data.varName] = { type: node.data.varType || 'text' };
    }
    if (node.type === 'httpRequestNode' && node.data?.responseVar) {
      variables[node.data.responseVar] = { type: 'text' };
    }
    if (node.type === 'globalVariableNode') {
      for (const e of node.data?.entries || []) {
        if (e.varName) variables[e.varName] = { type: e.varType || 'number' };
      }
    }
    if (node.type === 'inventoryNode') {
      for (const e of node.data?.entries || []) {
        if (e.itemKey) inventoryKeys.add(e.itemKey);
      }
    }
    if (node.type === 'relationNode') {
      for (const e of node.data?.entries || []) {
        if (e.characterKey) characterKeys.add(e.characterKey);
      }
    }
    if (node.type === 'achievementNode' && node.data?.achievementKey) {
      achievementKeys.add(node.data.achievementKey);
    }
  }
  return { variables, inventoryKeys: [...inventoryKeys], characterKeys: [...characterKeys], achievementKeys: [...achievementKeys] };
}

function useBotSuggestions(botId) {
  const [suggestions, setSuggestions] = useState({ variables: {}, inventoryKeys: [], characterKeys: [], achievementKeys: [] });
  useEffect(() => {
    if (!botId) return;
    getBot(botId).then(bot => setSuggestions(extractBotSuggestions(bot?.nodes))).catch(() => {});
  }, [botId]);
  return suggestions;
}

function SuggestInput({ value, onChange, suggestions, placeholder, style, invalid }) {
  const [open, setOpen] = useState(false);
  const filtered = (suggestions || []).filter(s => s.toLowerCase().includes((value || '').toLowerCase())).slice(0, 12);
  const border = invalid ? '1px solid #ef4444' : '1px solid #3a3f55';
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 80 }}>
      <input
        style={{ ...style, width: '100%', boxSizing: 'border-box', border }}
        value={value || ''}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => onChange(e.target.value)}
      />
      {open && filtered.length > 0 && (
        <div style={ss.drop}>
          {filtered.map(s => (
            <div key={s} style={ss.dropItem}
              onMouseEnter={e => e.currentTarget.style.background = '#2a2d3e'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onMouseDown={() => { onChange(s); setOpen(false); }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const ss = {
  drop: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#1a1c2a', border: '1px solid #3a3f55', borderRadius: 5, marginTop: 2, maxHeight: 180, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' },
  dropItem: { padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#a78bfa', background: 'transparent' },
};

function displayName(player) {
  return player.username ? `@${player.username}` : player.first_name || player.telegram_user_id;
}

function parseValue(type, value) {
  if (type === 'number') return Number(value) || 0;
  if (type === 'boolean') return value === true || value === 'true';
  return String(value ?? '');
}

function rewardsToEntries(rewards) {
  if (!rewards) return [];
  const entries = [];
  for (const [key, spec] of Object.entries(rewards.inventory || {})) {
    const { action, value } = (typeof spec === 'object' && spec !== null) ? spec : { action: 'add', value: spec };
    entries.push({ id: uuidv4(), rtype: 'inventory', key, action: action || 'add', value: Math.abs(Number(value) || 0) });
  }
  for (const [varName, spec] of Object.entries(rewards.variables || {})) {
    const varType = typeof spec === 'object' ? (spec.type || 'number') : 'number';
    const val = typeof spec === 'object' ? spec.value : spec;
    const action = typeof spec === 'object' ? (spec.action || 'set') : 'set';
    entries.push({ id: uuidv4(), rtype: 'variable', key: varName, varType, action, value: val ?? '' });
  }
  return entries;
}

function entriesToRewards(entries) {
  const inventory = {};
  const variables = {};
  for (const e of entries) {
    if (!e.key?.trim()) continue;
    if (e.rtype === 'inventory') {
      inventory[e.key.trim()] = { action: e.action || 'add', value: Math.abs(Number(e.value) || 0) };
    } else {
      const v = e.varType === 'boolean' ? (e.value === true || e.value === 'true') : e.varType === 'number' ? Number(e.value) || 0 : String(e.value ?? '');
      variables[e.key.trim()] = { type: e.varType || 'number', value: v, action: e.action || 'set' };
    }
  }
  return { inventory, variables };
}

function RewardBuilder({ entries, onChange, variables = {}, inventoryKeys = [] }) {
  const varNames = Object.keys(variables);

  function patch(id, p) { onChange(entries.map(e => e.id === id ? { ...e, ...p } : e)); }
  function add(rtype) { onChange([...entries, { id: uuidv4(), rtype, key: '', varType: 'number', action: rtype === 'inventory' ? 'add' : 'set', value: rtype === 'inventory' ? 1 : 0 }]); }
  function remove(id) { onChange(entries.filter(e => e.id !== id)); }

  function handleVarNameChange(id, name) {
    const known = variables[name];
    const varType = known?.type || entries.find(e => e.id === id)?.varType || 'number';
    patch(id, { key: name, varType, value: varType === 'boolean' ? false : varType === 'number' ? 0 : '' });
  }

  return (
    <div style={{ marginTop: 6 }}>
      {entries.map(e => {
        const varType = e.varType || 'number';
        const varKnown = e.rtype === 'variable' ? (e.key ? e.key in variables : true) : true;
        const invKnown = e.rtype === 'inventory' ? (e.key ? inventoryKeys.includes(e.key) : true) : true;
        return (
          <div key={e.id} style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <select style={s.select} value={e.rtype} onChange={ev => patch(e.id, { rtype: ev.target.value, key: '', value: ev.target.value === 'inventory' ? 1 : 0, action: ev.target.value === 'inventory' ? 'add' : 'set' })}>
              <option value="inventory">Инвентарь</option>
              <option value="variable">Переменная</option>
            </select>

            {e.rtype === 'inventory' ? (
              <SuggestInput
                value={e.key} suggestions={inventoryKeys} placeholder="ключ_предмета"
                style={s.smallInput} invalid={!invKnown}
                onChange={key => patch(e.id, { key })}
              />
            ) : (
              <SuggestInput
                value={e.key} suggestions={varNames} placeholder="имя_переменной"
                style={s.smallInput} invalid={!varKnown}
                onChange={name => handleVarNameChange(e.id, name)}
              />
            )}

            {e.rtype === 'inventory' ? (
              <select style={s.select} value={e.action || 'add'} onChange={ev => patch(e.id, { action: ev.target.value })}>
                <option value="add">+</option>
                <option value="subtract">−</option>
                <option value="set">=</option>
              </select>
            ) : (
              <select style={s.select} value={e.action || 'set'} onChange={ev => patch(e.id, { action: ev.target.value })}>
                <option value="set">=</option>
                <option value="increment">+</option>
                <option value="decrement">−</option>
              </select>
            )}

            {e.rtype === 'inventory' || varType !== 'boolean'
              ? <input style={{ ...s.quantity, width: 76 }} type={e.rtype === 'inventory' || varType === 'number' ? 'number' : 'text'} value={e.value ?? ''} onChange={ev => patch(e.id, { value: (e.rtype === 'inventory' || varType === 'number') ? +ev.target.value : ev.target.value })} />
              : <select style={s.select} value={String(e.value === true || e.value === 'true')} onChange={ev => patch(e.id, { value: ev.target.value === 'true' })}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
            }
            <button style={s.iconDanger} onClick={() => remove(e.id)}>×</button>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 5 }}>
        <button style={{ ...s.save, background: '#1e3a5f' }} onClick={() => add('inventory')}>+ Предмет</button>
        <button style={{ ...s.save, background: '#2a1f5b' }} onClick={() => add('variable')}>+ Переменная</button>
      </div>
    </div>
  );
}

function ProductsPanel({ botId, items, execute }) {
  const { variables, inventoryKeys } = useBotSuggestions(botId);
  const [pkey, setPkey] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [stars, setStars] = useState('');
  const [entries, setEntries] = useState([]);

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!pkey.trim() || !title.trim() || !stars) return;
    await execute(() => saveBotProduct(botId, pkey.trim(), { title, description: desc, priceStars: +stars, rewards: entriesToRewards(entries) }));
    setPkey(''); setTitle(''); setDesc(''); setStars(''); setEntries([]);
  }

  return (
    <div>
      <Section title="Товар Telegram Stars">
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <input style={{ ...s.smallInput, maxWidth: 120 }} placeholder="Ключ" value={pkey} onChange={e => setPkey(e.target.value)} />
            <CountedInput style={s.smallInput} placeholder="Название" value={title} maxLength={TELEGRAM_LIMITS.invoiceTitle} onChange={e => setTitle(e.target.value)} />
            <input style={s.quantity} type="number" min="1" placeholder="Stars" value={stars} onChange={e => setStars(e.target.value)} />
            <button style={s.primary} type="submit">Сохранить</button>
          </div>
          <div style={{ color: '#718096', fontSize: 11, marginBottom: 4 }}>Награды:</div>
          <RewardBuilder entries={entries} onChange={setEntries} variables={variables} inventoryKeys={inventoryKeys} />
        </form>
      </Section>
      <SimpleRows items={items} title="Товары" render={item => `${item.title} · ${item.price_stars} Stars · ${item.product_key}`} onDelete={item => execute(() => deleteBotProduct(botId, item.product_key))} />
    </div>
  );
}

function PromocodesPanel({ botId, items, execute, reload }) {
  const { variables, inventoryKeys } = useBotSuggestions(botId);
  const [code, setCode] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [entries, setEntries] = useState([]);

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!code.trim()) return;
    await execute(() => saveBotPromocode(botId, code.trim(), { rewards: entriesToRewards(entries), maxUses: +maxUses || null }));
    setCode(''); setMaxUses(''); setEntries([]);
  }

  return (
    <div>
      <Section title="Новый промокод">
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
            <input style={{ ...s.smallInput, maxWidth: 150 }} placeholder="КОД" value={code} onChange={e => setCode(e.target.value)} />
            <input style={s.quantity} type="number" min="0" placeholder="Лимит" value={maxUses} onChange={e => setMaxUses(e.target.value)} />
            <button style={s.primary} type="submit">Добавить</button>
          </div>
          <div style={{ color: '#718096', fontSize: 11, marginBottom: 4 }}>Награды:</div>
          <RewardBuilder entries={entries} onChange={setEntries} variables={variables} inventoryKeys={inventoryKeys} />
        </form>
      </Section>
      <SimpleRows items={items} title="Промокоды" render={item => `${item.code} · ${item.uses}/${item.max_uses ?? '∞'}`} onDelete={item => execute(() => deleteBotPromocode(botId, item.code))} />
    </div>
  );
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
            ['players', 'Игроки'], ['globals', 'Глобальные'], ['promocodes', 'Промокоды'], ['products', 'Магазин Stars'],
            ['analytics', 'Аналитика'], ['versions', 'Версии'], ['backups', 'Резервные копии'], ['jobs', 'Очередь'], ['roles', 'Роли'],
          ].map(([key, label]) => <button key={key} style={{ ...s.tab, ...(tab === key ? s.tabActive : {}) }} onClick={() => setTab(key)}>{label}</button>)}
        </div>

        {tab === 'players' ? <div style={s.body}>
          <div style={s.sidebar}>
            <div style={{ display: 'flex', gap: 5 }}>
            <input style={{ ...s.search, flex: 1 }} value={query} placeholder="Поиск игрока..." onChange={event => setQuery(event.target.value)} />
            <button style={{ ...s.primary, fontSize: 11, padding: '5px 8px', flexShrink: 0 }} title="Скачать CSV" onClick={() => {
              const rows = [['ID', 'Username', 'Имя', 'Нода', 'Инвентарь', 'Выборы'], ...players.map(p => [p.telegram_user_id, p.username || '', p.first_name || '', p.current_node_id || '', p.inventory_items, p.choices_count])];
              const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
              const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'players.csv'; a.click();
            }}>↓ CSV</button>
          </div>
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
  const { variables: schema } = useBotSuggestions(botId);
  const [name, setName] = useState('');
  const [type, setType] = useState('number');
  const [value, setValue] = useState('0');

  function handleNameSelect(n) {
    setName(n);
    const known = schema[n];
    if (known) {
      setType(known.type);
      setValue(known.type === 'boolean' ? 'false' : known.type === 'number' ? '0' : '');
    }
  }

  const varNames = Object.keys(schema);

  return (
    <Section title="Переменные">
      {Object.entries(player.variables).map(([varName, variable]) => {
        const knownType = schema[varName]?.type || variable.type;
        return (
          <form key={varName} style={s.editRow} onSubmit={event => {
            event.preventDefault();
            run(() => setBotPlayerVariable(botId, player.telegram_user_id, varName, {
              type: knownType,
              value: parseValue(knownType, new FormData(event.currentTarget).get('value')),
            }));
          }}>
            <span style={s.key}>{varName}</span>
            <span style={{ ...s.select, display: 'inline-flex', alignItems: 'center', color: '#94a3b8', background: '#0f172a', borderRadius: 5, padding: '0 8px', fontSize: 12, height: 30, flexShrink: 0 }}>
              {knownType === 'number' ? 'число' : knownType === 'boolean' ? 'логика' : 'текст'}
            </span>
            {knownType === 'boolean'
              ? <select name="value" defaultValue={String(variable.value)} style={s.select}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              : <input name="value" defaultValue={String(variable.value)} style={s.smallInput} type={knownType === 'number' ? 'number' : 'text'} />
            }
            <button style={s.save} disabled={busy}>Сохранить</button>
            <button type="button" style={s.iconDanger} onClick={() => run(() => deleteBotPlayerVariable(botId, player.telegram_user_id, varName))}>×</button>
          </form>
        );
      })}
      <form style={s.createRow} onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) return;
        run(() => setBotPlayerVariable(botId, player.telegram_user_id, name.trim(), { type, value: parseValue(type, value) }));
        setName('');
        setValue('0');
      }}>
        <SuggestInput
          value={name} suggestions={varNames} placeholder="Новая переменная"
          style={s.smallInput} onChange={handleNameSelect}
        />
        <span style={{ ...s.select, display: 'inline-flex', alignItems: 'center', color: '#94a3b8', background: '#0f172a', borderRadius: 5, padding: '0 8px', fontSize: 12, height: 30, flexShrink: 0 }}>
          {type === 'number' ? 'число' : type === 'boolean' ? 'логика' : 'текст'}
        </span>
        {type === 'boolean'
          ? <select style={s.select} value={value} onChange={event => setValue(event.target.value)}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          : <input style={s.smallInput} value={value} type={type === 'number' ? 'number' : 'text'} onChange={event => setValue(event.target.value)} />
        }
        <button style={s.primary} disabled={busy}>Добавить</button>
      </form>
    </Section>
  );
}

function InventorySection({ botId, player, busy, run }) {
  const { inventoryKeys } = useBotSuggestions(botId);
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
        <SuggestInput
          value={itemKey} suggestions={inventoryKeys} placeholder="Предмет из сценария"
          style={s.smallInput} onChange={setItemKey}
        />
        <input style={s.quantity} type="number" min="1" value={quantity} onChange={event => setQuantity(event.target.value)} />
        <button style={s.primary} disabled={busy}>Добавить</button>
      </form>
    </Section>
  );
}

function RelationSection({ botId, player, busy, run }) {
  const { characterKeys } = useBotSuggestions(botId);
  const [key, setKey] = useState('');
  const [value, setValue] = useState(0);
  return <Section title="Отношения с персонажами">
    {player.relations.map(item => <div key={item.character_key} style={s.editRow}>
      <span style={s.key}>{item.character_key}</span><span style={s.playerMeta}>{item.value}</span>
      <button style={s.iconDanger} onClick={() => run(() => deleteBotPlayerRelation(botId, player.telegram_user_id, item.character_key))}>×</button>
    </div>)}
    <form style={s.createRow} onSubmit={event => { event.preventDefault(); if (!key.trim()) return; run(() => setBotPlayerRelation(botId, player.telegram_user_id, key.trim(), { value: +value })); setKey(''); }}>
      <SuggestInput
        value={key} suggestions={characterKeys} placeholder="Персонаж из сценария"
        style={s.smallInput} onChange={setKey}
      />
      <input style={s.quantity} type="number" value={value} onChange={event => setValue(event.target.value)} />
      <button style={s.primary} disabled={busy}>Добавить</button>
    </form>
  </Section>;
}

function AchievementSection({ botId, player, busy, run }) {
  const { achievementKeys } = useBotSuggestions(botId);
  const [key, setKey] = useState('');
  return <Section title="Достижения">
    {player.achievements.map(item => <div key={item.achievement_key} style={s.editRow}>
      <span style={s.key}>{item.achievement_key}</span><span style={s.playerMeta}>{new Date(item.unlocked_at).toLocaleString('ru')}</span>
      <button style={s.iconDanger} onClick={() => run(() => deleteBotPlayerAchievement(botId, player.telegram_user_id, item.achievement_key))}>×</button>
    </div>)}
    <form style={s.createRow} onSubmit={event => { event.preventDefault(); if (!key.trim()) return; run(() => setBotPlayerAchievement(botId, player.telegram_user_id, key.trim())); setKey(''); }}>
      <SuggestInput
        value={key} suggestions={achievementKeys} placeholder="Достижение из сценария"
        style={s.smallInput} onChange={setKey}
      />
      <button style={s.primary} disabled={busy}>Выдать</button>
    </form>
  </Section>;
}

function ManagementPanel({ botId, tab, setError }) {
  const [items, setItems] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [form, setForm] = useState({});
  const loaders = { globals: listBotGlobals, promocodes: listBotPromocodes, products: listBotProducts, analytics: getBotAnalytics, versions: listBotVersions, backups: listBotBackups, jobs: listBotJobs, roles: listBotRoles };
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

  if (tab === 'globals') return <div style={s.management}>
    <Section title="Новая переменная">
      <form style={s.createRow} onSubmit={e => { e.preventDefault(); if (!form.gName?.trim()) return; execute(() => setBotGlobal(botId, form.gName.trim(), { type: form.gType || 'number', value: form.gType === 'text' ? (form.gVal || '') : form.gType === 'boolean' ? (form.gVal === 'true') : +form.gVal || 0 })); }}>
        <input style={s.smallInput} placeholder="Имя" value={form.gName || ''} onChange={e => update('gName', e.target.value)} />
        <select style={s.select} value={form.gType || 'number'} onChange={e => update('gType', e.target.value)}>
          <option value="number">число</option><option value="text">текст</option><option value="boolean">логика</option>
        </select>
        <input style={s.smallInput} placeholder="Значение" value={form.gVal ?? ''} onChange={e => update('gVal', e.target.value)} />
        <button style={s.primary}>Сохранить</button>
      </form>
    </Section>
    <SimpleRows items={items} title={`Глобальные переменные (${items.length})`}
      render={item => `${item.name}  =  ${String(item.value)}`}
      onDelete={item => execute(() => deleteBotGlobal(botId, item.name))} />
    <div style={{ padding: '6px 0', color: '#718096', fontSize: 11 }}>Доступны в условиях ветвления (источник: Глоб. переменная). Общие для всех игроков.</div>
  </div>;

  if (tab === 'analytics') return <div style={s.management}>
    <AnalyticsPanel analytics={analytics} />
  </div>;

  if (tab === 'promocodes') return <div style={s.management}>
    <PromocodesPanel botId={botId} items={items} execute={execute} />
  </div>;

  if (tab === 'products') return <div style={s.management}>
    <ProductsPanel botId={botId} items={items} execute={execute} />
  </div>;

  if (tab === 'versions') return <div style={s.management}>
    <button style={s.primary} onClick={() => execute(() => createBotVersion(botId))}>Создать снимок версии</button>
    <div style={{ background: '#0f172a', border: '1px solid #2d3458', borderRadius: 8, padding: '12px 14px', marginTop: 10, color: '#94a3b8', fontSize: 13, lineHeight: 1.7 }}>
      <div style={{ color: '#e0e7ff', fontWeight: 700, marginBottom: 6 }}>Что такое версии и зачем они нужны</div>
      <p style={{ margin: '0 0 8px' }}>Версия — это точная копия (снимок) вашего сценария в момент создания. Если вы внесёте изменения и что-то сломается, можно опубликовать старую версию и всё вернётся.</p>
      <div style={{ color: '#c4b5fd', fontWeight: 600, marginBottom: 4 }}>Как это работает:</div>
      <ol style={{ margin: '0 0 8px', paddingLeft: 18 }}>
        <li>Нажмите «Создать снимок версии» — система сохраняет текущий сценарий.</li>
        <li>Рядом со снимком укажите <b>Rollout %</b> и нажмите «Опубликовать».</li>
        <li>Новые игроки, которые напишут /start, получат эту версию сценария.</li>
      </ol>
      <div style={{ color: '#c4b5fd', fontWeight: 600, marginBottom: 4 }}>Что такое Rollout %:</div>
      <p style={{ margin: '0 0 8px' }}>Это процент <b>новых</b> игроков, которые получат новую версию. Например: Rollout 10% — только каждый десятый новый игрок попадёт на новую версию, остальные 90% продолжат играть на старой. Это позволяет тестировать изменения на небольшой аудитории, прежде чем раскатывать на всех.</p>
      <p style={{ margin: '0 0 4px' }}><b>Важно:</b> прогресс игроков не сбрасывается. Уже играющие остаются на своей версии — они переходят на новую только если вы публикуете с Rollout 100%.</p>
      <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Хранится не более 50 архивных версий. Самые старые удаляются автоматически при создании новой. Опубликованные версии не удаляются.</p>
    </div>
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
      <form style={s.createRow} onSubmit={event => {
        event.preventDefault();
        const filter = form.filterKey ? { source: form.filterSource || 'variable', key: form.filterKey, operator: form.filterOperator || '=', value: form.filterVal || '' } : undefined;
        execute(() => createBotJob(botId, { type: 'broadcast', runAt: form.runAt || new Date().toISOString(), payload: { text: form.text || '', filter, inactiveDays: +form.inactiveDays || 0 } }));
      }}>
        <CountedInput style={s.smallInput} placeholder="Текст рассылки" value={form.text || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter onChange={event => update('text', event.target.value)} />
        <input style={s.smallInput} type="datetime-local" value={form.runAt || ''} onChange={event => update('runAt', event.target.value)} />
        <button style={s.primary}>В очередь</button>
      </form>
      <div style={{ ...s.createRow, marginTop: 8, borderTop: '1px solid #2d3458', paddingTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#718096', alignSelf: 'center' }}>Фильтр аудитории:</span>
        <select style={s.select} value={form.filterSource || 'variable'} onChange={event => update('filterSource', event.target.value)}>
          <option value="variable">Переменная</option><option value="inventory">Предмет</option><option value="achievement">Достижение</option>
        </select>
        <input style={s.smallInput} placeholder="Ключ" value={form.filterKey || ''} onChange={event => update('filterKey', event.target.value)} />
        <select style={s.select} value={form.filterOperator || '='} onChange={event => update('filterOperator', event.target.value)}>
          {(form.filterSource === 'achievement' ? [['unlocked', 'получено'], ['not_unlocked', 'не получено']] : [['=', '='], ['!=', '≠'], ['>', '>'], ['<', '<'], ['>=', '≥'], ['<=', '≤']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input style={s.smallInput} placeholder="Значение" value={form.filterVal || ''} onChange={event => update('filterVal', event.target.value)} />
        <input style={s.quantity} type="number" min="0" placeholder="Неактивен дней" value={form.inactiveDays || ''} onChange={event => update('inactiveDays', event.target.value)} />
      </div>
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

      <Section title="Активность по дням за 30 дней">
        <BarChart items={analytics.daily || []} labelFn={item => new Date(item.day).toLocaleDateString('ru')} maxBars={30} />
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
