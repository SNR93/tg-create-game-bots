import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BoolButtons } from './VariableInspector';
import CountedInput from './CountedInput';
import { EDITOR_LIMITS } from '../../telegramLimits';

const OPS_BOOL = [['==', '== (равно)']];
const OPS_NUM  = [['==','=='],['!=','≠'],['>', '>'],['<','<'],['>=','≥'],['<=','≤']];
const OPS_ANY  = [['==','=='],['!=','≠']];

function getOps(type) {
  if (type === 'boolean') return OPS_BOOL;
  if (type === 'number')  return OPS_NUM;
  return OPS_ANY;
}

function emptyBranch(i) {
  return { id: uuidv4(), label: i === -1 ? 'Иначе' : `Ветка ${i + 1}`, conditions: [] };
}
function emptyCond() {
  return { id: uuidv4(), varName: '', operator: '==', value: '' };
}

export default function BranchingInspector({ data, onUpdate, botVariables = {} }) {
  const branches = data.branches || [];

  function setBranches(list) { onUpdate({ branches: list }); }

  function addBranch()      { setBranches([...branches, emptyBranch(branches.length)]); }
  function addElseBranch()  { setBranches([...branches, emptyBranch(-1)]); }
  function delBranch(id)    { setBranches(branches.filter(b => b.id !== id)); }

  function patchBranch(id, patch) {
    setBranches(branches.map(b => b.id === id ? { ...b, ...patch } : b));
  }

  function moveBranch(id, dir) {
    const arr = [...branches];
    const i = arr.findIndex(b => b.id === id);
    if (dir === 'up'   && i > 0)              [arr[i-1], arr[i]] = [arr[i], arr[i-1]];
    if (dir === 'down' && i < arr.length - 1) [arr[i+1], arr[i]] = [arr[i], arr[i+1]];
    setBranches(arr);
  }

  function addCond(branchId) {
    setBranches(branches.map(b =>
      b.id === branchId ? { ...b, conditions: [...(b.conditions || []), emptyCond()] } : b
    ));
  }

  function patchCond(branchId, condId, patch) {
    setBranches(branches.map(b =>
      b.id !== branchId ? b : {
        ...b,
        conditions: b.conditions.map(c => c.id === condId ? { ...c, ...patch } : c)
      }
    ));
  }

  function delCond(branchId, condId) {
    setBranches(branches.map(b =>
      b.id !== branchId ? b : { ...b, conditions: b.conditions.filter(c => c.id !== condId) }
    ));
  }

  return (
    <div>
      <Sect label="Название">
        <CountedInput style={s.inp} value={data.title || ''} maxLength={EDITOR_LIMITS.title} placeholder="Ветвление"
          onChange={e => onUpdate({ title: e.target.value })}
          onKeyDown={e => e.stopPropagation()} />
      </Sect>

      <Sect label={`Ветки (${branches.length})`}>
        <div style={s.hint}>
          Ветки проверяются сверху вниз. Выполняется первая, у которой все условия выполнены.
          Ветка без условий = «Иначе» (выполняется всегда).
        </div>

        {branches.map((branch, i) => (
          <BranchCard key={branch.id} branch={branch} index={i} total={branches.length}
            botVariables={botVariables}
            onPatch={p => patchBranch(branch.id, p)}
            onDel={() => delBranch(branch.id)}
            onMove={d => moveBranch(branch.id, d)}
            onAddCond={() => addCond(branch.id)}
            onPatchCond={(cId, p) => patchCond(branch.id, cId, p)}
            onDelCond={cId => delCond(branch.id, cId)}
          />
        ))}

        <div style={s.addRow}>
          <button style={s.addBtn} onClick={addBranch}>+ Ветка</button>
          <button style={{ ...s.addBtn, color: '#718096' }} onClick={addElseBranch}>+ Иначе</button>
        </div>
      </Sect>
    </div>
  );
}

function BranchCard({ branch, index, total, botVariables, onPatch, onDel, onMove, onAddCond, onPatchCond, onDelCond }) {
  const [open, setOpen] = useState(true);
  const isElse = !branch.conditions || branch.conditions.length === 0;

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <button style={s.colBtn} onClick={() => setOpen(v => !v)}>{open ? '▾' : '▸'}</button>
        <CountedInput style={s.labelInp} groupStyle={{ flex: 1 }} value={branch.label || ''} maxLength={EDITOR_LIMITS.shortText}
          placeholder={`Ветка ${index + 1}`}
          onChange={e => onPatch({ label: e.target.value })}
          onKeyDown={e => e.stopPropagation()} />
        {isElse && <span style={s.elseBadge}>иначе</span>}
        <button style={s.ctrl} onClick={() => onMove('up')}   disabled={index === 0}>↑</button>
        <button style={s.ctrl} onClick={() => onMove('down')} disabled={index === total - 1}>↓</button>
        <button style={{ ...s.ctrl, color: '#fc8181' }} onClick={onDel}>✕</button>
      </div>

      {open && (
        <div style={s.cardBody}>
          {(branch.conditions || []).length === 0 && (
            <div style={s.emptyHint}>Нет условий — ветка срабатывает всегда (иначе).</div>
          )}
          {(branch.conditions || []).map(cond => (
            <CondRow key={cond.id} cond={cond} botVariables={botVariables}
              onPatch={p => onPatchCond(cond.id, p)}
              onDel={() => onDelCond(cond.id)} />
          ))}
          <button style={s.addCondBtn} onClick={onAddCond}>+ Условие</button>
        </div>
      )}
    </div>
  );
}

function CondRow({ cond, botVariables, onPatch, onDel }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const varType = botVariables[cond.varName]?.type || null;
  const ops = getOps(varType);
  const allVars = Object.keys(botVariables);
  const filtered = cond.varName
    ? allVars.filter(n => n.toLowerCase().includes(cond.varName.toLowerCase()))
    : allVars;

  return (
    <div style={s.condWrap}>
      {/* Variable selector */}
      <div style={{ position: 'relative', marginBottom: 5 }}>
        <input style={s.condInp} value={cond.varName || ''}
          placeholder="🔍 Переменная..."
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setSearchOpen(false)}
          onChange={e => { setSearchOpen(true); onPatch({ varName: e.target.value }); }}
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
                  onPatch({ varName: n });
                  setSearchOpen(false);
                }}>
                <span style={{ color: '#a78bfa', fontWeight: 600, fontSize: 12 }}>{n}</span>
                <span style={{ color: '#4a5568', fontSize: 10, marginLeft: 6 }}>
                  {botVariables[n]?.type || '?'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Operator */}
      <select style={s.condSel} value={cond.operator || '=='}
        onChange={e => onPatch({ operator: e.target.value })}>
        {ops.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>

      {/* Value */}
      <div style={s.valWrap}>
        {varType === 'boolean' ? (
          <BoolButtons value={cond.value === true || cond.value === 'true'}
            onChange={v => onPatch({ value: v })} />
        ) : varType === 'number' ? (
          <input type="number" style={s.condInp} value={cond.value ?? ''}
            onChange={e => onPatch({ value: +e.target.value })}
            onKeyDown={e => e.stopPropagation()} />
        ) : (
          <CountedInput style={s.condInp} value={cond.value ?? ''} maxLength={EDITOR_LIMITS.shortText}
            placeholder="значение..."
            onChange={e => onPatch({ value: e.target.value })}
            onKeyDown={e => e.stopPropagation()} />
        )}
      </div>

      <button style={{ ...s.ctrl, color: '#fc8181', alignSelf: 'flex-start', marginTop: 2 }}
        onClick={onDel}>✕</button>
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
  condWrap: { display: 'flex', flexDirection: 'column', gap: 4, background: '#1a1c2a', border: '1px solid #2d3250', borderRadius: 6, padding: '8px', marginBottom: 6 },
  condInp: { width: '100%', boxSizing: 'border-box', background: '#0e0f18', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', fontSize: 12, padding: '4px 8px', outline: 'none' },
  condSel: { width: '100%', background: '#0e0f18', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', fontSize: 12, padding: '4px 8px', outline: 'none' },
  valWrap: { marginBottom: 2 },
  dropdown: { position: 'absolute', zIndex: 50, width: '100%', background: '#1a1c2a', border: '1px solid #3a3f55', borderRadius: 6, top: '100%', left: 0, maxHeight: 160, overflowY: 'auto' },
  dropItem: { padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  noRes: { padding: '7px 12px', color: '#4a5568', fontSize: 12 },
};
