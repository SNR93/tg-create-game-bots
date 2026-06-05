/**
 * Codex developer notes:
 * Панель интерфейса AdminPanel: отдельная рабочая область редактора или админского инструмента.
 * Панель держит локальные UI-состояния, но долгоживущие данные получает через props или API-клиент.
 * Изменения здесь часто влияют на UX, поэтому проверяй переполнение текста и поведение на узких экранах.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  createBotPlayer,
  createBotBackup,
  broadcastCount,
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

const OP_LABELS = { '=': '= равно', '!=': '≠ не равно', '>': '> больше', '<': '< меньше', '>=': '≥ больше или равно', '<=': '≤ меньше или равно' };
const ACHIEVEMENT_OP_LABELS = { 'unlocked': 'получено', 'not_unlocked': 'не получено' };

function BroadcastPanel({ botId, onSubmit, items, busy }) {
  const { variables, inventoryKeys, achievementKeys } = useBotSuggestions(botId);
  const varNames = Object.keys(variables);
  const textRef = useRef(null);
  const [text, setText] = useState('');
  const [runAt, setRunAt] = useState('');
  const [filters, setFilters] = useState([]);
  const [inactiveDays, setInactiveDays] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  function addFilter() {
    setFilters(f => [...f, { id: uuidv4(), source: 'variable', key: '', operator: '=', value: '' }]);
  }
  function removeFilter(id) { setFilters(f => f.filter(item => item.id !== id)); }
  function patchFilter(id, p) { setFilters(f => f.map(item => item.id === id ? { ...item, ...p } : item)); }

  function wrapSelection(open, close = open) {
    const el = textRef.current;
    if (!el) return;
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const selected = text.slice(start, end) || 'текст';
    const next = `${text.slice(0, start)}${open}${selected}${close}${text.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + open.length, start + open.length + selected.length);
    });
  }

  async function handlePreview() {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await broadcastCount(botId, { filters: filters.filter(f => f.key), inactiveDays: +inactiveDays || 0 });
      setPreview(res.count);
    } catch { setPreview('?'); }
    setPreviewLoading(false);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!text.trim()) return;
    const payload = {
      text,
      filters: filters.filter(f => f.key).map(({ source, key, operator, value }) => ({ source, key, operator, value })),
      inactiveDays: +inactiveDays || 0,
    };
    onSubmit({ type: 'broadcast', runAt: runAt || new Date().toISOString(), payload });
    setText(''); setFilters([]); setInactiveDays(''); setRunAt(''); setPreview(null);
  }

  const fmtTools = [
    { label: 'B', title: 'Жирный', open: '<b>', close: '</b>', style: { fontWeight: 700 } },
    { label: 'I', title: 'Курсив', open: '<i>', close: '</i>', style: { fontStyle: 'italic' } },
    { label: 'U', title: 'Подчеркнуть', open: '<u>', close: '</u>', style: { textDecoration: 'underline' } },
    { label: 'S', title: 'Зачеркнуть', open: '<s>', close: '</s>', style: { textDecoration: 'line-through' } },
    { label: '||', title: 'Спойлер', open: '<tg-spoiler>', close: '</tg-spoiler>' },
    { label: '<>', title: 'Код', open: '<code>', close: '</code>' },
  ];

  const jobStatusLabel = { pending: 'Ожидает', running: 'Отправляется', completed: 'Завершено', failed: 'Ошибка' };
  const jobStatusColor = { pending: '#94a3b8', running: '#38bdf8', completed: '#4ade80', failed: '#f87171' };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <Section title="Сообщение рассылки">
          {/* Formatting toolbar */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
            {fmtTools.map(t => (
              <button key={t.label} type="button" title={t.title}
                style={{ ...s.fmtBtn, ...(t.style || {}) }}
                onMouseDown={e => { e.preventDefault(); wrapSelection(t.open, t.close); }}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Large textarea */}
          <textarea
            ref={textRef}
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={4096}
            placeholder="Текст сообщения рассылки. Поддерживает Telegram HTML: <b>жирный</b>, <i>курсив</i>, <u>подчёркнутый</u> и т.д."
            style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box', minHeight: 140, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', color: text.length > 3800 ? '#f87171' : '#64748b', fontSize: 11, marginTop: 3 }}>
            {text.length} / 4096 символов · осталось {4096 - text.length}
          </div>
        </Section>

        <Section title="Дата и время отправки">
          <div style={{ color: '#718096', fontSize: 12, marginBottom: 8 }}>
            Оставьте пустым — рассылка уйдёт немедленно после добавления в очередь.
          </div>
          <input
            type="datetime-local"
            value={runAt}
            onChange={e => setRunAt(e.target.value)}
            style={{ ...s.smallInput, maxWidth: 260 }}
          />
        </Section>

        <Section title="Фильтр аудитории (необязательно)">
          <div style={{ color: '#718096', fontSize: 12, marginBottom: 10 }}>
            Ограничьте получателей по условиям. Все условия применяются одновременно (AND) — рассылку получат только те, кто соответствует <b style={{ color: '#94a3b8' }}>каждому</b> из них.
            Если условий нет — рассылка уйдёт всем игрокам.
          </div>

          {filters.map((f, idx) => {
            const isAchievement = f.source === 'achievement';
            const keySuggestions = f.source === 'variable' ? varNames : f.source === 'inventory' ? inventoryKeys : achievementKeys;
            const opOptions = isAchievement
              ? Object.entries(ACHIEVEMENT_OP_LABELS)
              : Object.entries(OP_LABELS);

            return (
              <div key={f.id} style={{ marginBottom: 10, background: '#0f172a', border: '1px solid #2d3458', borderRadius: 7, padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: '#718096', fontSize: 11, width: 36, flexShrink: 0 }}>#{idx + 1}</span>
                  <button type="button" style={{ ...s.iconDanger, marginLeft: 'auto' }} onClick={() => removeFilter(f.id)}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 160px 1fr', gap: 6, alignItems: 'start' }}>
                  <div>
                    <div style={sb.label}>Тип</div>
                    <select style={{ ...s.select, width: '100%' }} value={f.source}
                      onChange={e => patchFilter(f.id, { source: e.target.value, key: '', operator: e.target.value === 'achievement' ? 'unlocked' : '=', value: '' })}>
                      <option value="variable">Переменная</option>
                      <option value="inventory">Предмет</option>
                      <option value="achievement">Достижение</option>
                    </select>
                  </div>
                  <div>
                    <div style={sb.label}>{f.source === 'variable' ? 'Имя переменной' : f.source === 'inventory' ? 'Ключ предмета' : 'Ключ достижения'}</div>
                    <SuggestInput value={f.key} suggestions={keySuggestions} placeholder="Начните вводить..."
                      style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box' }} onChange={key => patchFilter(f.id, { key })} />
                  </div>
                  <div>
                    <div style={sb.label}>Условие</div>
                    <select style={{ ...s.select, width: '100%' }} value={f.operator}
                      onChange={e => patchFilter(f.id, { operator: e.target.value })}>
                      {opOptions.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                    </select>
                  </div>
                  {!isAchievement && (
                    <div>
                      <div style={sb.label}>Значение</div>
                      <input style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box' }} value={f.value}
                        placeholder={f.source === 'inventory' ? 'Количество' : 'Значение'}
                        onChange={e => patchFilter(f.id, { value: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <button type="button" style={{ ...s.save, background: '#1e3a5f', marginBottom: 10 }} onClick={addFilter}>
            + Добавить условие
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ color: '#718096', fontSize: 12 }}>Неактивны более</span>
            <input style={{ ...s.quantity, width: 70 }} type="number" min="0" value={inactiveDays}
              placeholder="дней" onChange={e => setInactiveDays(e.target.value)} />
            <span style={{ color: '#718096', fontSize: 12 }}>дней (0 = без ограничений)</span>
          </div>

          {/* Operator reference */}
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#111827', border: '1px solid #2d3458', borderRadius: 7 }}>
            <div style={{ color: '#818cf8', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>СПРАВКА ПО УСЛОВИЯМ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', fontSize: 11, color: '#94a3b8' }}>
              <div><code style={{ color: '#c4b5fd' }}>=</code> — точное совпадение</div>
              <div><code style={{ color: '#c4b5fd' }}>≠</code> — не равно</div>
              <div><code style={{ color: '#c4b5fd' }}>&gt; / &lt;</code> — больше / меньше (для чисел и инвентаря)</div>
              <div><code style={{ color: '#c4b5fd' }}>≥ / ≤</code> — больше или равно / меньше или равно</div>
              <div><code style={{ color: '#c4b5fd' }}>получено</code> — игрок имеет это достижение</div>
              <div><code style={{ color: '#c4b5fd' }}>не получено</code> — игрок не имеет достижение</div>
            </div>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 11 }}>
              Пример: Переменная «Монеты» ≥ 100 — получат только игроки у которых 100 и более монет.
            </div>
          </div>
        </Section>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
          <button type="button" style={{ ...s.save, background: '#1a2a3a' }} onClick={handlePreview} disabled={previewLoading}>
            {previewLoading ? 'Считаем...' : 'Посчитать аудиторию'}
          </button>
          {preview !== null && (
            <span style={{ color: '#38bdf8', fontSize: 13 }}>
              Получателей: <b>{preview}</b> игроков
            </span>
          )}
          <button style={{ ...s.primary, marginLeft: 'auto' }} disabled={busy || !text.trim()}>
            В очередь →
          </button>
        </div>
      </form>

      <Section title={`Задачи (${items.length})`}>
        {items.length === 0 && <div style={s.empty}>Задач нет.</div>}
        {items.map((item, idx) => {
          const p = item.payload || {};
          const total = p.total_count;
          const sent = p.sent_count;
          const failed = p.failed_count;
          const remaining = (total != null && sent != null && failed != null) ? Math.max(0, total - sent - failed) : null;
          const color = jobStatusColor[item.status] || '#94a3b8';
          return (
            <div key={item.id || idx} style={{ ...s.editRow, flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '8px 10px' }}>
              <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                <span style={{ color, fontWeight: 700, fontSize: 12 }}>{jobStatusLabel[item.status] || item.status}</span>
                <span style={{ color: '#64748b', fontSize: 11 }}>{new Date(item.run_at).toLocaleString('ru')}</span>
                {item.last_error && <span style={{ color: '#f87171', fontSize: 11 }}>⚠ {item.last_error}</span>}
              </div>
              {p.text && <div style={{ color: '#cbd5e1', fontSize: 12, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.text}</div>}
              {total != null && (
                <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                  <span style={{ color: '#94a3b8' }}>Всего: <b style={{ color: '#e2e8f0' }}>{total}</b></span>
                  {sent != null && <span style={{ color: '#94a3b8' }}>Отправлено: <b style={{ color: '#4ade80' }}>{sent}</b></span>}
                  {failed != null && failed > 0 && <span style={{ color: '#94a3b8' }}>Ошибок: <b style={{ color: '#f87171' }}>{failed}</b></span>}
                  {remaining != null && remaining > 0 && <span style={{ color: '#94a3b8' }}>Осталось: <b style={{ color: '#38bdf8' }}>{remaining}</b></span>}
                </div>
              )}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

const sb = {
  label: { color: '#64748b', fontSize: 11, marginBottom: 3 },
};

const ROLE_LABELS = { owner: 'Владелец', editor: 'Редактор', viewer: 'Зритель', denied: 'Запрещён' };
const ROLE_COLORS = { owner: '#818cf8', editor: '#38bdf8', viewer: '#94a3b8', denied: '#f87171' };
const ROLE_DESCS = {
  owner:  'Полный доступ: редактирование сценария, управление игроками, публикация версий и назначение ролей.',
  editor: 'Может редактировать сценарий и управлять игроками. Не может публиковать версии и управлять ролями.',
  viewer: 'Только просмотр сценария. Не может вносить изменения.',
  denied: 'Полный запрет. Пользователь не видит бот в списке и не может его открыть.',
};

function RolesPanel({ botId, setError }) {
  const [roles, setRoles] = useState([]);
  const [myRole, setMyRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [userKey, setUserKey] = useState('');
  const [role, setRole] = useState('viewer');
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await listBotRoles(botId);
      setRoles(res.roles || []);
      setMyRole(res.myRole || 'viewer');
    } catch (e) { setError(e.message); }
  }, [botId, setError]);

  useEffect(() => { load(); }, [load]);

  const isOwner = myRole === 'owner';

  async function handleSave(event) {
    event.preventDefault();
    if (!userKey.trim()) return;
    setBusy(true);
    try {
      await saveBotRole(botId, userKey.trim(), role, comment);
      setUserKey(''); setComment(''); await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleDelete(key) {
    setBusy(true);
    try { await deleteBotRole(botId, key); await load(); } catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <>
      {/* Hint block */}
      <div style={{ background: '#0f172a', border: '1px solid #2d3458', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ color: '#818cf8', fontWeight: 700, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>Как работают роли</div>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 8px', lineHeight: 1.6 }}>
          По умолчанию все пользователи имеют право <b style={{ color: '#94a3b8' }}>Зритель</b> — могут открыть и посмотреть бот, но не могут ничего изменить.
          Индивидуальное правило имеет приоритет над <code style={{ color: '#c4b5fd' }}>@all</code>.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 11 }}>
          {Object.entries(ROLE_DESCS).map(([r, desc]) => (
            <div key={r} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ color: ROLE_COLORS[r], fontWeight: 700, flexShrink: 0 }}>{ROLE_LABELS[r]}</span>
              <span style={{ color: '#64748b' }}>{desc}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, padding: '7px 10px', background: '#111827', borderRadius: 6, fontSize: 11, color: '#94a3b8' }}>
          <b style={{ color: '#c4b5fd' }}>@all</b> — специальный логин, устанавливает право по умолчанию для всех пользователей.
          Например: <code style={{ color: '#c4b5fd' }}>@all = Запрещён</code> + <code style={{ color: '#c4b5fd' }}>alice = Редактор</code>
          — все заблокированы, кроме alice.
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: '#475569' }}>
          Пользователи <b>admin</b> и <b>SNR93</b> всегда имеют права Владельца на все боты.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Ваша роль в этом боте:</span>
        <span style={{ color: ROLE_COLORS[myRole], fontWeight: 700, fontSize: 13 }}>{ROLE_LABELS[myRole] || myRole}</span>
      </div>

      {/* Add/edit form — owner only */}
      {isOwner && (
        <Section title="Назначить роль">
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 6, marginBottom: 6 }}>
              <div>
                <div style={sb.label}>Логин пользователя или @all</div>
                <input style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box' }}
                  placeholder="логин или @all (для всех)"
                  value={userKey} onChange={e => setUserKey(e.target.value)} />
              </div>
              <div>
                <div style={sb.label}>Право доступа</div>
                <select style={{ ...s.select, width: '100%' }} value={role} onChange={e => setRole(e.target.value)}>
                  {Object.entries(ROLE_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>{lbl}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={sb.label}>Комментарий (необязательно)</div>
              <input style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box' }}
                placeholder="Например: тестировщик, временный доступ..."
                value={comment} maxLength={500} onChange={e => setComment(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={s.primary} disabled={busy || !userKey.trim()}>Сохранить</button>
            </div>
          </form>
        </Section>
      )}

      {/* Roles list */}
      <Section title={`Правила доступа (${roles.length})`}>
        {roles.length === 0 && (
          <div style={s.empty}>Нет явных правил. Все пользователи имеют право «Зритель» по умолчанию.</div>
        )}
        {roles.map(item => (
          <div key={item.user_key} style={{ ...s.editRow, flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '8px 10px' }}>
            <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
              <code style={{ color: '#c4b5fd', fontSize: 13, fontWeight: 700 }}>
                {item.user_key}
              </code>
              <span style={{ color: ROLE_COLORS[item.role] || '#94a3b8', fontWeight: 600, fontSize: 12 }}>
                {ROLE_LABELS[item.role] || item.role}
              </span>
              <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto' }}>
                {new Date(item.created_at).toLocaleDateString('ru')}
              </span>
              {isOwner && (
                <button style={s.iconDanger} onClick={() => handleDelete(item.user_key)}>×</button>
              )}
            </div>
            {item.comment && (
              <div style={{ color: '#64748b', fontSize: 11, paddingLeft: 2 }}>{item.comment}</div>
            )}
          </div>
        ))}
      </Section>
    </>
  );
}

function ManagementPanel({ botId, tab, setError }) {
  const [items, setItems] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [form, setForm] = useState({});
  const loaders = { globals: listBotGlobals, promocodes: listBotPromocodes, products: listBotProducts, analytics: getBotAnalytics, versions: listBotVersions, backups: listBotBackups, jobs: listBotJobs };
  const load = useCallback(async () => {
    if (!loaders[tab]) return;
    try {
      setError('');
      const result = await loaders[tab](botId);
      if (tab === 'analytics') setAnalytics(result); else setItems(result);
    } catch (error) { setError(error.message); }
  }, [botId, tab, setError]);
  useEffect(() => { load(); }, [load]);
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const execute = async action => { try { setError(''); setBusy(true); await action(); setForm({}); await load(); } catch (error) { setError(error.message); } finally { setBusy(false); } };

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

  if (tab === 'roles') return <div style={s.management}><RolesPanel botId={botId} setError={setError} /></div>;

  return <div style={s.management}>
    <BroadcastPanel botId={botId} items={items} busy={busy} onSubmit={job => execute(() => createBotJob(botId, job))} />
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
  fmtBtn: { width: 30, height: 27, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 5, color: '#cbd5e1', fontSize: 12, cursor: 'pointer', padding: 0 },
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
