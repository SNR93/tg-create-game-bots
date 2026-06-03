import React from 'react';

export default function VariablePanel({ runtimeVars, patchVar }) {
  const entries = Object.entries(runtimeVars);

  return (
    <div style={s.panel}>
      <div style={s.title}>📦 Переменные</div>
      <div style={s.list}>
        {entries.length === 0 && (
          <div style={s.empty}>Переменные появятся<br />после запуска</div>
        )}
        {entries.map(([name, v]) => (
          <div key={name} style={s.row}>
            <div style={s.name}>{name}</div>
            <div style={s.type}>{v.type}</div>
            {v.type === 'boolean' ? (
              <div style={s.boolRow}>
                <button style={{ ...s.boolBtn, background: v.value ? '#22c55e' : '#2a2d3e', color: v.value ? '#fff' : '#718096' }}
                  onClick={() => patchVar(name, true)}>true</button>
                <button style={{ ...s.boolBtn, background: !v.value ? '#ef4444' : '#2a2d3e', color: !v.value ? '#fff' : '#718096' }}
                  onClick={() => patchVar(name, false)}>false</button>
              </div>
            ) : v.type === 'text' ? (
              <input
                type="text"
                style={s.textInput}
                value={v.value ?? ''}
                onChange={e => patchVar(name, e.target.value)}
                onKeyDown={e => e.stopPropagation()}
              />
            ) : (
              <div style={s.numRow}>
                <button style={s.numBtn} onClick={() => patchVar(name, (+v.value || 0) - 1)}>−</button>
                <input
                  type="number"
                  style={s.numInput}
                  value={v.value ?? 0}
                  onChange={e => patchVar(name, +e.target.value)}
                  onKeyDown={e => e.stopPropagation()}
                />
                <button style={s.numBtn} onClick={() => patchVar(name, (+v.value || 0) + 1)}>+</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  panel: { display: 'flex', flexDirection: 'column', height: '100%', background: '#1a1c2a', borderRadius: 10, overflow: 'hidden' },
  title: { padding: '12px 16px', borderBottom: '1px solid #2d3458', fontWeight: 700, fontSize: 14, color: '#e2e8f0', flexShrink: 0 },
  list: { flex: 1, overflowY: 'auto', padding: '8px' },
  empty: { color: '#4a5568', fontSize: 12, textAlign: 'center', lineHeight: 1.7, padding: '24px 0' },
  row: { background: '#12131a', borderRadius: 8, padding: '10px 12px', marginBottom: 8 },
  name: { fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 2 },
  type: { fontSize: 10, color: '#4a5568', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  boolRow: { display: 'flex', gap: 6 },
  boolBtn: { flex: 1, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '5px 0', cursor: 'pointer' },
  numRow: { display: 'flex', alignItems: 'center', gap: 6 },
  numBtn: { background: '#2a2d3e', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 16, width: 30, height: 30, flexShrink: 0, cursor: 'pointer' },
  numInput: { width: 92, minWidth: 92, maxWidth: 92, background: '#0e0f18', border: '1px solid #3a3f55', borderRadius: 6, color: '#f6ad55', fontSize: 16, fontWeight: 700, textAlign: 'center', padding: '4px 0', outline: 'none' },
  textInput: { width: '100%', boxSizing: 'border-box', background: '#0e0f18', border: '1px solid #3a3f55', borderRadius: 6, color: '#f6ad55', fontSize: 13, fontWeight: 600, padding: '7px 8px', outline: 'none' },
};
