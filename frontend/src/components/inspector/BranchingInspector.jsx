/**
 * Codex developer notes:
 * Инспектор настроек BranchingInspector: форма редактирования data для выбранной ноды.
 * Инспектор не должен напрямую сохранять бота на сервер: он меняет локальное состояние редактора, а сохранение делает страница редактора.
 * При добавлении полей нужно обновлять defaults, визуальную ноду, симулятор/runtime и проверки сценария.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React, { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BoolButtons } from './VariableInspector';
import CountedInput from './CountedInput';
import { EDITOR_LIMITS, TELEGRAM_LIMITS } from '../../telegramLimits';

// Sources that conditions can check
const SOURCES = [
  { value: 'variable',    label: 'Переменная' },
  { value: 'inventory',   label: 'Инвентарь' },
  { value: 'relation',    label: 'Отношение' },
  { value: 'achievement', label: 'Достижение' },
  { value: 'global',      label: 'Глоб. переменная' },
];

const OPS_BOOL        = [['==', '== (равно)']];
const OPS_NUM         = [['==','=='],['!=','≠'],['>','>'],['<','<'],['>=','≥'],['<=','≤']];
const OPS_ANY         = [['==','=='],['!=','≠']];
const OPS_ACHIEVEMENT = [['has','имеет'],['not_has','не имеет']];
const OPS_NUMERIC_KEY = [['==','=='],['!=','≠'],['>','>'],['<','<'],['>=','≥'],['<=','≤']]; // for inventory/relation

function getOps(source, varType) {
  if (source === 'achievement') return OPS_ACHIEVEMENT;
  if (source === 'inventory' || source === 'relation') return OPS_NUMERIC_KEY;
  if (varType === 'boolean') return OPS_BOOL;
  if (varType === 'number')  return OPS_NUM;
  return OPS_ANY;
}

function emptyBranch(i) {
  return { id: uuidv4(), label: i === -1 ? 'Иначе' : `Ветка ${i + 1}`, conditions: [] };
}
function emptyCond() {
  return { id: uuidv4(), source: 'variable', key: '', operator: '==', value: '' };
}

export default function BranchingInspector({ data, onUpdate, botVariables = {}, nodes = [] }) {
  const branches = data.branches || [];
  function setBranches(list) { onUpdate({ branches: list }); }
  function addBranch()      { setBranches([...branches, emptyBranch(branches.length)]); }
  function addElseBranch()  { setBranches([...branches, emptyBranch(-1)]); }
  function delBranch(id)    { setBranches(branches.filter(b => b.id !== id)); }
  function patchBranch(id, patch) { setBranches(branches.map(b => b.id === id ? { ...b, ...patch } : b)); }
  function moveBranch(id, dir) {
    const arr = [...branches]; const i = arr.findIndex(b => b.id === id);
    if (dir === 'up'   && i > 0)              [arr[i-1], arr[i]] = [arr[i], arr[i-1]];
    if (dir === 'down' && i < arr.length - 1) [arr[i+1], arr[i]] = [arr[i], arr[i+1]];
    setBranches(arr);
  }
  function addCond(bId) { setBranches(branches.map(b => b.id === bId ? { ...b, conditions: [...(b.conditions||[]), emptyCond()] } : b)); }
  function patchCond(bId, cId, patch) {
    setBranches(branches.map(b => b.id !== bId ? b : { ...b, conditions: b.conditions.map(c => c.id === cId ? { ...c, ...patch } : c) }));
  }
  function delCond(bId, cId) {
    setBranches(branches.map(b => b.id !== bId ? b : { ...b, conditions: b.conditions.filter(c => c.id !== cId) }));
  }

  const nodeKeys = useMemo(() => {
    const inventory = new Set();
    const achievement = new Set();
    const relation = new Set();
    for (const node of nodes) {
      if (node.type === 'inventoryNode') {
        for (const e of (node.data?.entries || [])) { if (e.itemKey) inventory.add(e.itemKey); }
      }
      if (node.type === 'achievementNode' && node.data?.achievementKey) {
        achievement.add(node.data.achievementKey);
      }
      if (node.type === 'relationNode') {
        for (const e of (node.data?.entries || [])) {
          const key = (e.reputationType && e.reputationTarget)
            ? `${e.reputationType}.${e.reputationTarget}`
            : (e.characterKey || '');
          if (key) relation.add(key);
        }
      }
    }
    return { inventory: [...inventory], achievement: [...achievement], relation: [...relation] };
  }, [nodes]);

  return (
    <div>
      <Sect label={`Ветки (${branches.length})`}>
        <div style={s.hint}>Проверяются сверху вниз. Срабатывает первая, у которой все условия выполнены. Ветка без условий — «иначе».</div>
        {branches.map((branch, i) => (
          <BranchCard key={branch.id} branch={branch} index={i} total={branches.length}
            botVariables={botVariables}
            nodeKeys={nodeKeys}
            onPatch={p => patchBranch(branch.id, p)}
            onDel={() => delBranch(branch.id)}
            onMove={d => moveBranch(branch.id, d)}
            onAddCond={() => addCond(branch.id)}
            onPatchCond={(cId, p) => patchCond(branch.id, cId, p)}
            onDelCond={cId => delCond(branch.id, cId)} />
        ))}
        <div style={s.addRow}>
          <button style={s.addBtn} onClick={addBranch}>+ Ветка</button>
          <button style={{ ...s.addBtn, color: '#718096' }} onClick={addElseBranch}>+ Иначе</button>
        </div>
      </Sect>
    </div>
  );
}

function BranchCard({ branch, index, total, botVariables, nodeKeys, onPatch, onDel, onMove, onAddCond, onPatchCond, onDelCond }) {
  const [open, setOpen] = useState(true);
  const isElse = !branch.conditions || branch.conditions.length === 0;
  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <button style={s.colBtn} onClick={() => setOpen(v => !v)}>{open ? '▾' : '▸'}</button>
        <CountedInput style={s.labelInp} groupStyle={{ flex: 1 }} value={branch.label || ''} maxLength={TELEGRAM_LIMITS.inlineButtonLabel}
          placeholder={`Ветка ${index + 1}`} onChange={e => onPatch({ label: e.target.value })} onKeyDown={e => e.stopPropagation()} />
        {isElse && <span style={s.elseBadge}>иначе</span>}
        <button style={s.ctrl} onClick={() => onMove('up')}   disabled={index === 0}>↑</button>
        <button style={s.ctrl} onClick={() => onMove('down')} disabled={index === total - 1}>↓</button>
        <button style={{ ...s.ctrl, color: '#fc8181' }} onClick={onDel}>✕</button>
      </div>
      {open && (
        <div style={s.cardBody}>
          {(branch.conditions || []).length === 0 && <div style={s.emptyHint}>Нет условий — ветка срабатывает всегда.</div>}
          {(branch.conditions || []).map(cond => (
            <CondRow key={cond.id} cond={cond} botVariables={botVariables} nodeKeys={nodeKeys}
              onPatch={p => onPatchCond(cond.id, p)}
              onDel={() => onDelCond(cond.id)} />
          ))}
          <button style={s.addCondBtn} onClick={onAddCond}>+ Условие</button>
        </div>
      )}
    </div>
  );
}

function CondRow({ cond, botVariables, nodeKeys = {}, onPatch, onDel }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const source  = cond.source || 'variable';
  const key     = cond.key || cond.varName || '';
  const varType = source === 'variable' ? (botVariables[key]?.type || null) : (source === 'global' ? 'number' : null);
  const ops     = getOps(source, varType);
  const isAchievement = source === 'achievement';

  // Key autocomplete based on source
  const allKeys = source === 'variable' || source === 'global'
    ? Object.keys(botVariables)
    : source === 'inventory'
      ? (nodeKeys.inventory || [])
      : source === 'achievement'
        ? (nodeKeys.achievement || [])
        : source === 'relation'
          ? (nodeKeys.relation || [])
          : [];
  const filtered = key ? allKeys.filter(k => k.toLowerCase().includes(key.toLowerCase())) : allKeys;

  const sourceBadgeColor = { variable: '#a78bfa', inventory: '#f6ad55', relation: '#f87171', achievement: '#4ade80', global: '#38bdf8' };

  return (
    <div style={s.condWrap}>
      {/* Source selector */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 5 }}>
        <select style={{ ...s.condSel, flex: 1, color: sourceBadgeColor[source] || '#e2e8f0' }}
          value={source} onChange={e => onPatch({ source: e.target.value, key: '', operator: e.target.value === 'achievement' ? 'has' : '==' })}>
          {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Key input (autocomplete for variables) */}
      <div style={{ position: 'relative', marginBottom: 5 }}>
        <input style={s.condInp} value={key}
          placeholder={source === 'inventory' ? '🎒 Предмет...' : source === 'relation' ? '♥ person.Имя / guild.Гильдия...' : source === 'achievement' ? '🏆 Ключ достижения...' : '🔍 Имя переменной...'}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
          onChange={e => { setSearchOpen(true); onPatch({ key: e.target.value, varName: e.target.value }); }}
          onKeyDown={e => e.stopPropagation()} />
        {searchOpen && allKeys.length > 0 && (
          <div style={s.dropdown}>
            {filtered.length === 0 && <div style={s.noRes}>Не найдено</div>}
            {filtered.map(k => (
              <div key={k} style={s.dropItem}
                onMouseEnter={e => e.currentTarget.style.background = '#2a2d3e'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onMouseDown={e => { e.preventDefault(); onPatch({ key: k, varName: k }); setSearchOpen(false); }}>
                <span style={{ color: '#a78bfa', fontWeight: 600, fontSize: 12 }}>{k}</span>
                <span style={{ color: '#4a5568', fontSize: 10, marginLeft: 6 }}>{botVariables[k]?.type || '?'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Operator */}
      <select style={{ ...s.condSel, marginBottom: 5 }} value={cond.operator || ops[0]?.[0] || '=='}
        onChange={e => onPatch({ operator: e.target.value })}>
        {ops.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>

      {/* Value (hidden for achievements with has/not_has) */}
      {!isAchievement && (
        <div style={s.valWrap}>
          {varType === 'boolean' ? (
            <BoolButtons value={cond.value === true || cond.value === 'true'} onChange={v => onPatch({ value: v })} />
          ) : (source === 'inventory' || source === 'relation' || varType === 'number') ? (
            <input type="number" style={s.condInp} value={cond.value ?? ''}
              onChange={e => onPatch({ value: +e.target.value })} onKeyDown={e => e.stopPropagation()} />
          ) : (
            <CountedInput style={s.condInp} value={cond.value ?? ''} maxLength={EDITOR_LIMITS.shortText}
              placeholder="значение..." onChange={e => onPatch({ value: e.target.value })} onKeyDown={e => e.stopPropagation()} />
          )}
        </div>
      )}

      <button style={{ ...s.ctrl, color: '#fc8181', alignSelf: 'flex-start' }} onClick={onDel}>✕</button>
    </div>
  );
}

function Sect({ label, children }) {
  return <div style={s.sect}><div style={s.sLabel}>{label}</div>{children}</div>;
}

const s = {
  sect: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  sLabel: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  inp: { width: '100%', boxSizing: 'border-box', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none' },
  hint: { fontSize: 11, color: '#4a5568', lineHeight: 1.5, marginBottom: 10 },
  addRow: { display: 'flex', gap: 6, marginTop: 8 },
  addBtn: { flex: 1, background: '#1e2030', border: '1px dashed #3a3f55', borderRadius: 6, color: '#3b82f6', fontSize: 12, padding: '6px 0', cursor: 'pointer', fontWeight: 600 },
  card: { background: '#12131a', border: '1px solid #3a3f55', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', background: '#1e2030', borderBottom: '1px solid #3a3f55' },
  colBtn: { background: 'transparent', border: 'none', color: '#718096', fontSize: 13, cursor: 'pointer', padding: '0 2px', flexShrink: 0 },
  labelInp: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 12, fontWeight: 600 },
  elseBadge: { fontSize: 9, color: '#f6ad55', background: 'rgba(246,173,85,0.15)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 },
  ctrl: { background: 'transparent', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 12, padding: '0 3px', flexShrink: 0 },
  cardBody: { padding: '10px 10px' },
  emptyHint: { fontSize: 11, color: '#4a5568', fontStyle: 'italic', marginBottom: 6 },
  addCondBtn: { width: '100%', background: 'transparent', border: '1px dashed #3a3f55', borderRadius: 5, color: '#718096', fontSize: 11, padding: '4px 0', cursor: 'pointer', marginTop: 4 },
  condWrap: { display: 'flex', flexDirection: 'column', gap: 0, background: '#1a1c2a', border: '1px solid #2d3250', borderRadius: 6, padding: '8px', marginBottom: 6 },
  condInp: { width: '100%', boxSizing: 'border-box', background: '#0e0f18', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', fontSize: 12, padding: '4px 8px', outline: 'none' },
  condSel: { width: '100%', background: '#0e0f18', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', fontSize: 12, padding: '4px 8px', outline: 'none' },
  valWrap: { marginBottom: 2 },
  dropdown: { position: 'absolute', zIndex: 50, width: '100%', background: '#1a1c2a', border: '1px solid #3a3f55', borderRadius: 6, top: '100%', left: 0, maxHeight: 160, overflowY: 'auto' },
  dropItem: { padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  noRes: { padding: '7px 12px', color: '#4a5568', fontSize: 12 },
};
