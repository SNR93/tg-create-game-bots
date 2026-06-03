import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import PlaceholderField from './PlaceholderField';
import { EDITOR_LIMITS } from '../../telegramLimits';

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

function getOps(source) {
  if (source === 'achievement') return OPS_ACH;
  if (source === 'inventory' || source === 'relation') return OPS_NUM;
  return OPS_NUM;
}

function emptyCondition() {
  return { enabled: false, source: 'variable', key: '', operator: '==', value: '' };
}

export default function KeyboardInspector({ data, onUpdate }) {
  const buttons = data.buttons || [];
  const timeout = data.timeout || 0;

  function setButtons(list) { onUpdate({ buttons: list }); }
  function addButton() { setButtons([...buttons, { id: uuidv4(), label: `Вариант ${buttons.length + 1}`, type: 'callback', url: '', condition: emptyCondition() }]); }
  function patchButton(id, patch) { setButtons(buttons.map(b => b.id === id ? { ...b, ...patch } : b)); }
  function patchCond(id, patch) { setButtons(buttons.map(b => b.id === id ? { ...b, condition: { ...b.condition, ...patch } } : b)); }
  function delButton(id) { setButtons(buttons.filter(b => b.id !== id)); }
  function move(id, dir) {
    const arr = [...buttons]; const i = arr.findIndex(b => b.id === id);
    if (dir === 'up'   && i > 0)              [arr[i-1], arr[i]] = [arr[i], arr[i-1]];
    if (dir === 'down' && i < arr.length - 1) [arr[i+1], arr[i]] = [arr[i], arr[i+1]];
    setButtons(arr);
  }

  return (
    <div>
      <Sect label="Название блока">
        <PlaceholderField style={s.inp} value={data.title || ''} placeholder="Клавиатура"
          maxLength={EDITOR_LIMITS.title} onChange={e => onUpdate({ title: e.target.value })} onKeyDown={e => e.stopPropagation()} />
      </Sect>

      <Sect label="Таймаут (сек)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" min="0" style={{ ...s.inp, width: 90 }} value={timeout}
            onChange={e => onUpdate({ timeout: Math.max(0, +e.target.value) })}
            onKeyDown={e => e.stopPropagation()} placeholder="0" />
          <span style={s.hint}>{timeout > 0 ? `Через ${timeout} сек → выход «Таймаут»` : 'Отключён'}</span>
        </div>
      </Sect>

      <Sect label={`Варианты (${buttons.length})`}>
        <div style={s.hint}>Callback-кнопки ожидают нажатия. URL-кнопки открывают ссылку (не блокируют сценарий). Если все visible-кнопки скрыты условием — нода пропускается.</div>
        {buttons.length === 0 && <div style={s.empty}>Нет вариантов</div>}
        {buttons.map((btn, i) => (
          <ButtonCard key={btn.id} btn={btn} index={i} total={buttons.length}
            onPatch={p => patchButton(btn.id, p)}
            onPatchCond={p => patchCond(btn.id, p)}
            onDel={() => delButton(btn.id)}
            onMove={d => move(btn.id, d)} />
        ))}
        <button style={s.addBtn} onClick={addButton}>+ Добавить вариант</button>
      </Sect>
    </div>
  );
}

function ButtonCard({ btn, index, total, onPatch, onPatchCond, onDel, onMove }) {
  const [showCond, setShowCond] = useState(false);
  const cond = btn.condition || emptyCondition();
  const isUrl = btn.type === 'url';
  const ops = getOps(cond.source);
  const isAch = cond.source === 'achievement';

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
        <button style={{ ...s.ctrl, color: cond.enabled ? '#38bdf8' : '#4a5568' }} title="Условие показа"
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
            <input type="checkbox" checked={!!cond.enabled} onChange={e => onPatchCond({ enabled: e.target.checked })} />
            <span style={{ fontSize: 12, color: '#a0aec0' }}>Показывать только при условии</span>
          </label>
          {cond.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
              <select style={s.sel} value={cond.source || 'variable'} onChange={e => onPatchCond({ source: e.target.value, operator: e.target.value === 'achievement' ? 'has' : '==' })}>
                {COND_SOURCES.map(src => <option key={src.value} value={src.value}>{src.label}</option>)}
              </select>
              <input style={s.inp} value={cond.key || ''} placeholder="Ключ / имя переменной"
                onChange={e => onPatchCond({ key: e.target.value })} onKeyDown={e => e.stopPropagation()} />
              <select style={s.sel} value={cond.operator || ops[0]} onChange={e => onPatchCond({ operator: e.target.value })}>
                {ops.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              {!isAch && (
                <input style={s.inp} value={cond.value ?? ''} placeholder="Значение"
                  onChange={e => onPatchCond({ value: e.target.value })} onKeyDown={e => e.stopPropagation()} />
              )}
            </div>
          )}
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
};
