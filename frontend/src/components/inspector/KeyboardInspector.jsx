/**
 * Codex developer notes:
 * Инспектор настроек KeyboardInspector: форма редактирования data для выбранной ноды.
 * Инспектор не должен напрямую сохранять бота на сервер: он меняет локальное состояние редактора, а сохранение делает страница редактора.
 * При добавлении полей нужно обновлять defaults, визуальную ноду, симулятор/runtime и проверки сценария.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React, { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import PlaceholderField from './PlaceholderField';
import { BoolButtons } from './VariableInspector';
import { EDITOR_LIMITS, TELEGRAM_LIMITS, SYSTEM_PLACEHOLDER_NAMES, isSystemPlaceholderName } from '../../telegramLimits';

const COND_SOURCES = [
  { value: 'variable',    label: 'Переменная' },
  { value: 'inventory',   label: 'Инвентарь' },
  { value: 'relation',    label: 'Отношение' },
  { value: 'achievement', label: 'Достижение' },
  { value: 'global',      label: 'Глоб. переменная' },
];
const OPS_NUM  = ['==','!=','>','<','>=','<='];
const OPS_BOOL = ['=='];
const OPS_ACH  = ['has', 'not_has'];

function getOps(source, varType) {
  if (source === 'achievement') return OPS_ACH;
  if (source === 'inventory' || source === 'relation') return OPS_NUM;
  if (varType === 'boolean') return OPS_BOOL;
  return OPS_NUM;
}

function emptyCondition() {
  return { id: uuidv4(), enabled: false, source: 'variable', key: '', operator: '==', value: '' };
}

function activeButtonConditions(btn) {
  if (Array.isArray(btn.conditions) && btn.conditions.length > 0) {
    return btn.conditions.filter(cond => cond?.enabled);
  }
  return btn.condition?.enabled ? [btn.condition] : [];
}

function editableButtonConditions(btn) {
  if (Array.isArray(btn.conditions) && btn.conditions.length > 0) {
    return btn.conditions.map((cond, index) => ({ id: cond.id || `condition-${index}`, ...cond }));
  }
  if (btn.condition) return [{ id: btn.condition.id || 'legacy-condition', ...btn.condition }];
  return [];
}

function ensureEditableConditions(btn) {
  const existing = editableButtonConditions(btn);
  if (existing.length) return existing.map(cond => ({ ...cond, enabled: true }));
  return [{ ...emptyCondition(), enabled: true }];
}

function sortedUnique(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

function getConditionSuggestions(nodes = [], botVariables = {}) {
  const playerVars = [];
  const globalVars = [];
  const inventory = [];
  const relations = [];
  const achievements = [];

  for (const node of nodes || []) {
    if (node.type === 'variableNode') (node.data?.entries || []).forEach(entry => playerVars.push(entry.varName));
    if (node.type === 'textInputNode') playerVars.push(node.data?.varName);
    if (node.type === 'httpRequestNode') playerVars.push(node.data?.responseVar);
    if (node.type === 'globalVariableNode') (node.data?.entries || []).forEach(entry => globalVars.push(entry.varName));
    if (node.type === 'inventoryNode') (node.data?.entries || []).forEach(entry => inventory.push(entry.itemKey));
    if (node.type === 'relationNode') (node.data?.entries || []).forEach(entry => relations.push(entry.characterKey));
    if (node.type === 'achievementNode') achievements.push(node.data?.achievementKey);
  }

  const fallbackVars = Object.keys(botVariables || {}).filter(name => !isSystemPlaceholderName(name));
  return {
    variable: sortedUnique(playerVars.length ? playerVars : fallbackVars).filter(name => !isSystemPlaceholderName(name)),
    global: sortedUnique(globalVars),
    inventory: sortedUnique(inventory),
    relation: sortedUnique(relations),
    achievement: sortedUnique(achievements),
  };
}

function cleanQuery(value) {
  return String(value || '').trim().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
}

function shouldIncludeSystem(source, value) {
  if (source !== 'variable') return false;
  const query = cleanQuery(value).toLowerCase();
  return !!query && SYSTEM_PLACEHOLDER_NAMES.some(name => name.toLowerCase().startsWith(query));
}

export default function KeyboardInspector({ data, onUpdate, botVariables = {}, placeholderVariables = {}, nodes = [] }) {
  const buttons = data.buttons || [];
  const timeout = data.timeout || 0;
  const canAddButton = buttons.length < TELEGRAM_LIMITS.inlineKeyboardButtons;
  const suggestions = useMemo(() => getConditionSuggestions(nodes, botVariables), [nodes, botVariables]);
  const systemNames = useMemo(() => (
    sortedUnique(Object.keys(placeholderVariables || {}).filter(name => isSystemPlaceholderName(name)))
  ), [placeholderVariables]);

  function setButtons(list) { onUpdate({ buttons: list }); }
  function addButton() {
    if (!canAddButton) return;
    setButtons([...buttons, { id: uuidv4(), label: `Вариант ${buttons.length + 1}`, type: 'callback', url: '', condition: emptyCondition() }]);
  }
  function patchButton(id, patch) { setButtons(buttons.map(b => b.id === id ? { ...b, ...patch } : b)); }
  function delButton(id) { setButtons(buttons.filter(b => b.id !== id)); }
  function move(id, dir) {
    const arr = [...buttons]; const i = arr.findIndex(b => b.id === id);
    if (dir === 'up'   && i > 0)              [arr[i-1], arr[i]] = [arr[i], arr[i-1]];
    if (dir === 'down' && i < arr.length - 1) [arr[i+1], arr[i]] = [arr[i], arr[i+1]];
    setButtons(arr);
  }

  return (
    <div>
      <Sect label="Таймаут (сек)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" min="0" style={{ ...s.inp, width: 90 }} value={timeout}
            onChange={e => onUpdate({ timeout: Math.max(0, +e.target.value) })}
            onKeyDown={e => e.stopPropagation()} placeholder="0" />
          <span style={s.hint}>{timeout > 0 ? `Через ${timeout} сек → выход «Таймаут»` : 'Отключён'}</span>
        </div>
      </Sect>

      <Sect label="Текст перед кнопками">
        <PlaceholderField style={s.inp} value={data.promptText ?? ''} maxLength={EDITOR_LIMITS.shortText}
          placeholder="Ваш выбор:" onChange={e => onUpdate({ promptText: e.target.value })}
          onKeyDown={e => e.stopPropagation()} />
        <div style={s.hint}>Текст сообщения перед кнопками. По умолчанию: «Ваш выбор:»</div>
      </Sect>

      <Sect label={`Варианты (${buttons.length} / ${TELEGRAM_LIMITS.inlineKeyboardButtons})`}>
        <div style={s.hint}>Callback-кнопки ожидают нажатия. URL-кнопки открывают ссылку (не блокируют сценарий). Telegram допускает не более {TELEGRAM_LIMITS.inlineKeyboardButtons} inline-кнопок в одной клавиатуре. Если все visible-кнопки скрыты условием — нода пропускается.</div>
        {buttons.length === 0 && <div style={s.empty}>Нет вариантов</div>}
        {buttons.map((btn, i) => (
          <ButtonCard key={btn.id} btn={btn} index={i} total={buttons.length}
            botVariables={botVariables}
            suggestions={suggestions}
            systemNames={systemNames.length ? systemNames : SYSTEM_PLACEHOLDER_NAMES}
            onPatch={p => patchButton(btn.id, p)}
            onDel={() => delButton(btn.id)}
            onMove={d => move(btn.id, d)} />
        ))}
        <button style={{ ...s.addBtn, opacity: canAddButton ? 1 : 0.45, cursor: canAddButton ? 'pointer' : 'not-allowed' }} disabled={!canAddButton} onClick={addButton}>+ Добавить вариант</button>
      </Sect>
    </div>
  );
}

function ButtonCard({ btn, index, total, botVariables, suggestions, systemNames, onPatch, onDel, onMove }) {
  const [showCond, setShowCond] = useState(false);
  const conditions = editableButtonConditions(btn);
  const activeConditions = activeButtonConditions(btn);
  const condEnabled = activeConditions.length > 0;
  const isUrl = btn.type === 'url';

  function setConditions(nextConditions) {
    const normalized = nextConditions.map(cond => ({ ...cond, id: cond.id || uuidv4() }));
    onPatch({
      conditions: normalized,
      condition: normalized[0] || { ...(btn.condition || emptyCondition()), enabled: false },
    });
  }

  function toggleConditions(enabled) {
    if (enabled) {
      setConditions(ensureEditableConditions(btn));
    } else {
      setConditions((conditions.length ? conditions : [emptyCondition()]).map(cond => ({ ...cond, enabled: false })));
    }
  }

  function patchCondition(condId, patch) {
    setConditions(conditions.map(cond => cond.id === condId ? { ...cond, ...patch } : cond));
  }

  function addCondition() {
    setConditions([...(conditions.length ? conditions : ensureEditableConditions(btn)), { ...emptyCondition(), enabled: true }]);
  }

  function deleteCondition(condId) {
    const next = conditions.filter(cond => cond.id !== condId);
    setConditions(next.length ? next : [{ ...emptyCondition(), enabled: false }]);
  }

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <span style={s.idx}>{index + 1}</span>
        <select style={{ ...s.sel, width: 85 }} value={btn.type || 'callback'} onChange={e => onPatch({ type: e.target.value })}>
          <option value="callback">Callback</option>
          <option value="url">URL</option>
        </select>
        <PlaceholderField style={{ ...s.inp, flex: 1 }} value={btn.label || ''}
          maxLength={EDITOR_LIMITS.shortText}
          onChange={e => onPatch({ label: e.target.value })} onKeyDown={e => e.stopPropagation()} />
        <button style={{ ...s.ctrl, color: condEnabled ? '#38bdf8' : '#4a5568' }} title="Условие показа"
          onClick={() => setShowCond(v => !v)}>⚙</button>
        <button style={s.ctrl} onClick={() => onMove('up')}   disabled={index === 0}>↑</button>
        <button style={s.ctrl} onClick={() => onMove('down')} disabled={index === total - 1}>↓</button>
        <button style={{ ...s.ctrl, color: '#fc8181' }} onClick={onDel}>✕</button>
      </div>

      {isUrl && (
        <div style={{ padding: '6px 10px', borderTop: '1px solid #2d3250' }}>
          <input style={{ ...s.inp, width: '100%', boxSizing: 'border-box' }} value={btn.url || ''} placeholder="https://..."
            onChange={e => onPatch({ url: e.target.value })} onKeyDown={e => e.stopPropagation()} />
        </div>
      )}

      {showCond && (
        <div style={s.condPanel}>
          <label style={s.checkRow}>
            <input type="checkbox" checked={condEnabled} onChange={e => toggleConditions(e.target.checked)} />
            <span style={{ fontSize: 12, color: '#a0aec0' }}>Показывать только при условиях</span>
          </label>
          {condEnabled && (
            <div style={s.condList}>
              {conditions.filter(cond => cond.enabled).map((cond, condIndex) => (
                <ConditionRow
                  key={cond.id}
                  cond={cond}
                  index={condIndex}
                  total={activeConditions.length}
                  botVariables={botVariables}
                  suggestions={suggestions}
                  systemNames={systemNames}
                  onPatch={patch => patchCondition(cond.id, patch)}
                  onDelete={() => deleteCondition(cond.id)}
                />
              ))}
              <button style={s.addCondBtn} onClick={addCondition}>+ Условие</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConditionRow({ cond, index, total, botVariables, suggestions, systemNames, onPatch, onDelete }) {
  const source = cond.source || 'variable';
  const key = cond.key || cond.varName || '';
  const varType = (source === 'variable' || source === 'global') ? (botVariables?.[key]?.type || null) : null;
  const ops = getOps(source, varType);
  const isAch = source === 'achievement';
  const isBool = !isAch && varType === 'boolean';
  const operator = ops.includes(cond.operator) ? cond.operator : ops[0];

  function patchKey(value) {
    const nextType = (source === 'variable' || source === 'global') ? (botVariables?.[value]?.type || null) : null;
    const patch = { key: value, varName: value };
    if (nextType === 'boolean') {
      patch.operator = '==';
      if (cond.value !== true && cond.value !== false && cond.value !== 'true' && cond.value !== 'false') {
        patch.value = false;
      }
    }
    onPatch(patch);
  }

  return (
    <div style={s.condCard}>
      <div style={s.condHead}>
        <span style={s.condIndex}>{index + 1}</span>
        <select style={{ ...s.sel, flex: 1 }} value={source} onChange={e => onPatch({ source: e.target.value, key: '', varName: '', operator: e.target.value === 'achievement' ? 'has' : '==', value: '' })}>
          {COND_SOURCES.map(src => <option key={src.value} value={src.value}>{src.label}</option>)}
        </select>
        <button style={{ ...s.ctrl, color: '#fc8181' }} onClick={onDelete} disabled={total <= 1}>×</button>
      </div>
      <SuggestionInput
        value={cond.key || ''}
        source={source}
        suggestions={suggestions}
        systemNames={systemNames}
        onChange={patchKey}
      />
      <select style={s.sel} value={operator} onChange={e => onPatch({ operator: e.target.value })}>
        {ops.map(op => <option key={op} value={op}>{op}</option>)}
      </select>
      {!isAch && (
        isBool ? (
          <BoolButtons value={cond.value === true || cond.value === 'true'} onChange={value => onPatch({ value })} />
        ) : (
        <input style={s.inp} value={cond.value ?? ''} placeholder="Значение"
          onChange={e => onPatch({ value: e.target.value })} onKeyDown={e => e.stopPropagation()} />
        )
      )}
    </div>
  );
}

function SuggestionInput({ value, source, suggestions, systemNames, onChange }) {
  const [open, setOpen] = useState(false);
  const query = cleanQuery(value).toLowerCase();
  const sourceKeys = suggestions[source] || [];
  const includeSystem = shouldIncludeSystem(source, value);
  const keys = sortedUnique(includeSystem ? [...sourceKeys, ...systemNames] : sourceKeys);
  const filtered = query
    ? keys.filter(key => key.toLowerCase().includes(query))
    : keys;
  const normalizedValue = cleanQuery(value).toLowerCase();
  const exists = normalizedValue ? keys.some(key => key.toLowerCase() === normalizedValue) : null;

  return (
    <div style={s.suggestWrap}>
      <input
        style={{
          ...s.inp,
          width: '100%',
          boxSizing: 'border-box',
          ...(exists === null ? {} : {
            borderColor: exists ? '#22c55e' : '#ef4444',
            color: exists ? '#bbf7d0' : '#fecaca',
          }),
        }}
        value={value}
        placeholder={source === 'inventory' ? 'Item key' : source === 'relation' ? 'Character key' : source === 'achievement' ? 'Achievement key' : 'Variable name'}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => { setOpen(true); onChange(e.target.value); }}
        onKeyDown={e => e.stopPropagation()}
      />
      {open && keys.length > 0 && (
        <div style={s.dropdown}>
          {filtered.length === 0 && <div style={s.noRes}>No suggestions</div>}
          {filtered.map(key => {
            const system = isSystemPlaceholderName(key);
            return (
              <button
                type="button"
                key={key}
                style={s.dropItem}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(key); setOpen(false); }}
              >
                <span style={{ ...s.dropKey, color: system ? '#38bdf8' : '#a78bfa' }}>{system ? `{{${key}}}` : key}</span>
                {system && <span style={s.dropType}>system</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Sect({ label, children }) {
  return <div style={s.sect}><div style={s.sLabel}>{label}</div>{children}</div>;
}

const s = {
  sect: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  sLabel: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  hint: { fontSize: 11, color: '#4a5568', lineHeight: 1.5 },
  empty: { color: '#4a5568', fontSize: 12, fontStyle: 'italic', marginBottom: 6 },
  card: { background: '#12131a', border: '1px solid #3a3f55', borderRadius: 8, marginBottom: 6, overflow: 'hidden' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px' },
  idx: { fontSize: 11, color: '#4a5568', width: 18, textAlign: 'center', flexShrink: 0 },
  inp: { background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', fontSize: 12, padding: '5px 8px', outline: 'none' },
  sel: { background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', fontSize: 12, padding: '5px 6px', outline: 'none' },
  ctrl: { background: 'transparent', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 12, padding: '2px 3px', flexShrink: 0 },
  addBtn: { width: '100%', background: '#1e2030', border: '1px dashed #3a3f55', borderRadius: 6, color: '#a0aec0', fontSize: 13, padding: '7px 0', cursor: 'pointer', marginTop: 4 },
  condPanel: { padding: '8px 10px', borderTop: '1px solid #2d3250', background: '#0e0f18' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  condList: { display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 },
  condCard: { display: 'flex', flexDirection: 'column', gap: 5, padding: 7, background: '#12131a', border: '1px solid #2d3250', borderRadius: 6 },
  condHead: { display: 'flex', alignItems: 'center', gap: 5 },
  condIndex: { width: 18, flexShrink: 0, color: '#4a5568', fontSize: 11, textAlign: 'center' },
  addCondBtn: { width: '100%', background: 'transparent', border: '1px dashed #3a3f55', borderRadius: 5, color: '#718096', fontSize: 11, padding: '5px 0', cursor: 'pointer' },
  suggestWrap: { position: 'relative', width: '100%' },
  dropdown: { position: 'absolute', zIndex: 80, top: '100%', left: 0, right: 0, maxHeight: 170, overflowY: 'auto', background: '#1a1c2a', border: '1px solid #3a3f55', borderRadius: 6, boxShadow: '0 8px 20px rgba(0,0,0,0.45)' },
  dropItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', padding: '7px 9px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' },
  dropKey: { fontSize: 12, fontWeight: 600 },
  dropType: { color: '#4a5568', fontSize: 10 },
  noRes: { padding: '7px 9px', color: '#718096', fontSize: 12 },
};
