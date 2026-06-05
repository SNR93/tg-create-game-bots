/**
 * Codex developer notes:
 * Инспектор настроек VariableInspector: форма редактирования data для выбранной ноды.
 * Инспектор не должен напрямую сохранять бота на сервер: он меняет локальное состояние редактора, а сохранение делает страница редактора.
 * При добавлении полей нужно обновлять defaults, визуальную ноду, симулятор/runtime и проверки сценария.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React, { useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import CountedInput from './CountedInput';
import { EDITOR_LIMITS, isSystemPlaceholderName } from '../../telegramLimits';

const ACTIONS_BOOL = [['set','= Установить'],['init','= Задать если не задана']];
const ACTIONS_NUM  = [['set','= Установить'],['increment','+ Прибавить'],['decrement','− Вычесть'],['init','= Задать если не задана']];

function EmptyEntry(type = 'boolean') {
  return { id: uuidv4(), varName: '', varType: type, action: 'set', value: type === 'number' ? 0 : (type === 'text' ? '' : false) };
}

// Shared True/False buttons component (also exported for BranchingInspector)
export function BoolButtons({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button style={{ flex:1, border:'none', borderRadius:6, fontSize:12, fontWeight:700, padding:'5px 0', cursor:'pointer',
        background: value === true  ? '#22c55e' : '#2a2d3e', color: value === true  ? '#fff' : '#718096' }}
        onClick={() => onChange(true)}>True</button>
      <button style={{ flex:1, border:'none', borderRadius:6, fontSize:12, fontWeight:700, padding:'5px 0', cursor:'pointer',
        background: value === false ? '#ef4444' : '#2a2d3e', color: value === false ? '#fff' : '#718096' }}
        onClick={() => onChange(false)}>False</button>
    </div>
  );
}

export default function VariableInspector({ data, onUpdate, botVariables = {}, onRenameVariable }) {
  const entries = data.entries || [];
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [newEntry, setNewEntry] = useState(EmptyEntry());
  const [nameError, setNameError] = useState('');
  const reservedNames = Object.keys(botVariables);
  const botVarNames = reservedNames.filter(name => !isSystemPlaceholderName(name));

  function setEntries(list) { onUpdate({ entries: list }); }

  function addNew() {
    const varName = newEntry.varName.trim();
    if (!varName) return;
    if (isSystemPlaceholderName(varName)) {
      setNameError(`Имя «${varName}» зарезервировано системным плейсхолдером`);
      return;
    }
    if (hasVariable(varName)) {
      setNameError(`Переменная «${varName}» уже существует`);
      return;
    }
    setEntries([...entries, { ...newEntry, id: uuidv4(), varName, isReference: false }]);
    setNameError('');
    setNewEntry(EmptyEntry());
  }

  function addExisting(varName) {
    if (!varName || entries.some(e => e.varName?.toLowerCase() === varName.toLowerCase())) return;
    const existing = botVariables[varName] || {};
    const varType = existing.type || 'boolean';
    const value = existing.defaultValue ?? (varType === 'number' ? 0 : false);
    setEntries([...entries, { id: uuidv4(), varName, varType, action: 'set', value, isReference: true }]);
    setNameError('');
    setSearch('');
    setSearchOpen(false);
  }

  function patchEntry(id, patch) {
    const entry = entries.find(e => e.id === id);
    if (
      entry &&
      patch.varName !== undefined &&
      patch.varName !== entry.varName &&
      isSystemPlaceholderName(patch.varName)
    ) {
      setNameError(`Имя «${patch.varName}» зарезервировано системным плейсхолдером`);
      return;
    }
    if (
      entry &&
      patch.varName !== undefined &&
      patch.varName !== entry.varName &&
      hasVariable(patch.varName, entry.varName)
    ) {
      setNameError(`Переменная «${patch.varName}» уже существует`);
      return;
    }
    setNameError('');
    setEntries(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  function delEntry(id) {
    setNameError('');
    setEntries(entries.filter(e => e.id !== id));
  }

  function hasVariable(name, exceptName = '') {
    const normalized = name.trim().toLowerCase();
    const excluded = exceptName.trim().toLowerCase();
    if (!normalized) return false;
    return reservedNames.some(n =>
      n.toLowerCase() === normalized &&
      n.toLowerCase() !== excluded
    ) || entries.some(e =>
      e.varName?.trim().toLowerCase() === normalized &&
      e.varName?.trim().toLowerCase() !== excluded
    );
  }

  const filtered = botVarNames.filter(n =>
    n.toLowerCase().includes(search.toLowerCase()) &&
    !entries.find(e => e.varName?.toLowerCase() === n.toLowerCase())
  );

  return (
    <div>
      {/* Create new variable */}
      <Sect label="Создать переменную">
        <div style={s.newRow}>
          <CountedInput style={s.inp} groupStyle={{ flex: 1 }} value={newEntry.varName} maxLength={EDITOR_LIMITS.key} placeholder="Имя переменной..."
            onChange={e => { setNameError(''); setNewEntry(v => ({ ...v, varName: e.target.value })); }}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') addNew(); }} />
          <select style={s.sel} value={newEntry.varType}
            onChange={e => setNewEntry(v => ({ ...v, varType: e.target.value, value: e.target.value === 'number' ? 0 : (e.target.value === 'text' ? '' : false), action: 'set' }))}>
            <option value="boolean">True / False</option>
            <option value="number">Число (123)</option>
            <option value="text">Текст</option>
          </select>
        </div>
        <select style={{ ...s.sel, width: '100%', marginBottom: 6 }} value={newEntry.action}
          onChange={e => setNewEntry(v => ({ ...v, action: e.target.value }))}>
          {(newEntry.varType === 'number' ? ACTIONS_NUM : ACTIONS_BOOL).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        {newEntry.varType === 'number'
          ? <input type="number" style={{ ...s.inp, marginBottom: 6 }} value={newEntry.value}
              onChange={e => setNewEntry(v => ({ ...v, value: +e.target.value }))}
              onKeyDown={e => e.stopPropagation()} />
          : newEntry.varType === 'text'
            ? <CountedInput style={{ ...s.inp, marginBottom: 6 }} value={newEntry.value || ''} maxLength={EDITOR_LIMITS.shortText}
                placeholder="Текстовое значение"
                onChange={e => setNewEntry(v => ({ ...v, value: e.target.value }))}
                onKeyDown={e => e.stopPropagation()} />
          : <BoolButtons value={newEntry.value} onChange={v => setNewEntry(p => ({ ...p, value: v }))} />}
        <button style={s.addBtn} onClick={addNew}>+ Добавить</button>
        {nameError && <div style={s.error}>{nameError}</div>}
      </Sect>

      {/* Existing variables in bot — cascading search */}
      {botVarNames.length > 0 && (
        <Sect label="Добавить из существующих">
          <input style={s.inp} value={search} placeholder="🔍 Поиск переменной..."
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.stopPropagation()} />
          {searchOpen && (
            <div style={s.dropdown}>
              {filtered.length === 0 && <div style={s.noRes}>Не найдено</div>}
              {filtered.map(n => (
                <div key={n} style={s.dropItem}
                  onMouseEnter={e => e.currentTarget.style.background = '#2a2d3e'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onMouseDown={e => {
                    e.preventDefault();
                    addExisting(n);
                  }}>
                  <span style={s.dName}>{n}</span>
                </div>
              ))}
            </div>
          )}
        </Sect>
      )}

      {/* Current entries */}
      <Sect label={`Операции в этой ноде (${entries.length})`}>
        {entries.length === 0 && <div style={s.empty}>Нет операций</div>}
        {entries.map(e => (
          <EntryCard key={e.id} entry={e}
            onPatch={p => patchEntry(e.id, p)}
            onRename={onRenameVariable}
            onDel={() => delEntry(e.id)} />
        ))}
      </Sect>
    </div>
  );
}

function EntryCard({ entry, onPatch, onRename, onDel }) {
  const actions = entry.varType === 'number' ? ACTIONS_NUM : ACTIONS_BOOL;
  const action = actions.some(([key]) => key === entry.action) ? entry.action : 'set';
  const focusedName = useRef(null);

  function handleNameBlur() {
    const oldName = String(focusedName.current || '').trim();
    const newName = String(entry.varName || '').trim();
    focusedName.current = null;
    if (oldName && newName && oldName !== newName && onRename) {
      onRename(oldName, newName);
    }
  }

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <span style={s.cardName}>{entry.varName || '(без имени)'}</span>
        <span style={s.cardType}>{entry.varType === 'number' ? '123' : entry.varType === 'text' ? 'TXT' : 'T/F'}</span>
        <button style={s.delBtn} onClick={onDel}>✕</button>
      </div>
      <div style={s.cardBody}>
        <CountedInput style={{ ...s.inp, marginBottom: 5 }} value={entry.varName} maxLength={EDITOR_LIMITS.key}
          placeholder="Имя..."
          onChange={e => onPatch({ varName: e.target.value })}
          onFocus={() => { focusedName.current = entry.varName; }}
          onBlur={handleNameBlur}
          onKeyDown={e => e.stopPropagation()} />
        <select style={{ ...s.sel, width: '100%', marginBottom: 5 }} value={action}
          onChange={e => onPatch({ action: e.target.value })}>
          {actions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {entry.varType === 'number'
          ? <input type="number" style={s.inp} value={entry.value}
              onChange={e => onPatch({ value: +e.target.value })}
              onKeyDown={e => e.stopPropagation()} />
          : entry.varType === 'text'
            ? <CountedInput style={s.inp} value={entry.value || ''} maxLength={EDITOR_LIMITS.shortText}
                placeholder="Текст"
                onChange={e => onPatch({ value: e.target.value })}
                onKeyDown={e => e.stopPropagation()} />
          : <BoolButtons value={entry.value} onChange={v => onPatch({ value: v })} />}
      </div>
    </div>
  );
}

function Sect({ label, children }) {
  return <div style={s.sect}><div style={s.sLabel}>{label}</div>{children}</div>;
}

const s = {
  sect: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  sLabel: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  newRow: { display: 'flex', gap: 6, marginBottom: 6 },
  inp: { width: '100%', boxSizing: 'border-box', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none' },
  sel: { background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 12, padding: '6px 8px', outline: 'none', flexShrink: 0 },
  boolRow: { display: 'flex', gap: 6, marginBottom: 6 },
  boolBtn: { flex: 1, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '5px 0', cursor: 'pointer' },
  addBtn: { width: '100%', background: '#3b82f6', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, padding: '6px 0', cursor: 'pointer', marginTop: 4 },
  dropdown: { background: '#1a1c2a', border: '1px solid #3a3f55', borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: 'auto' },
  dropItem: { padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 },
  dName: { fontSize: 13, color: '#a78bfa', fontWeight: 600 },
  noRes: { padding: '8px 12px', color: '#4a5568', fontSize: 12 },
  error: { color: '#fc8181', fontSize: 11, marginTop: 6 },
  empty: { color: '#4a5568', fontSize: 12, fontStyle: 'italic' },
  card: { background: '#12131a', border: '1px solid #3a3f55', borderRadius: 7, marginBottom: 8, overflow: 'hidden' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: '#1e2030', borderBottom: '1px solid #3a3f55' },
  cardName: { flex: 1, fontSize: 12, fontWeight: 700, color: '#a78bfa' },
  cardType: { fontSize: 10, color: '#4a5568', background: '#2a2d3e', borderRadius: 4, padding: '1px 5px' },
  renameBtn: { background: 'transparent', border: '1px solid #3a3f55', borderRadius: 5, color: '#38bdf8', cursor: 'pointer', fontSize: 12, padding: '1px 6px' },
  delBtn: { background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 12 },
  cardBody: { padding: '8px 10px' },
};
