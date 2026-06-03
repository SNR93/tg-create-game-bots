import React, { useEffect, useRef, useState } from 'react';
import { ADDABLE_NODES } from '../nodes/nodeCatalog';

export default function ContextMenu({ x, y, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  const menuW = 240;
  const menuH = 420;
  const safeX = x + menuW > window.innerWidth ? x - menuW : x;
  const safeY = y + menuH > window.innerHeight ? y - menuH : y;

  const aliases = {
    keyboardNode: 'клавиатура кнопки выбор',
    branchingNode: 'условие ветвление',
    formulaNode: 'формула калькулятор',
    randomNode: 'рандом случайность',
    delayNode: 'пауза ожидание',
  };
  const preferred = ['simpleMessageNode', 'messageChainNode', 'keyboardNode'];
  const orderedNodes = !query.trim()
    ? [...ADDABLE_NODES].sort((a, b) => {
        const ai = preferred.indexOf(a.type);
        const bi = preferred.indexOf(b.type);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return 0;
      })
    : ADDABLE_NODES;
  const filtered = orderedNodes.filter(n =>
    !query.trim() || `${n.label} ${n.desc} ${aliases[n.type] || ''}`.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    inputRef.current?.focus();

    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} style={{ ...s.wrap, top: safeY, left: safeX }}>
      <div style={s.header}>
        <div style={s.headerTitle}>Добавить блок</div>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск блока..."
          style={s.input}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter' && filtered.length === 1) {
              onSelect(filtered[0].type, query);
              onClose();
            }
          }}
        />
      </div>

      <div style={s.list}>
        {filtered.length === 0 ? (
          <div style={s.empty}>Ничего не найдено</div>
        ) : (
          filtered.map(n => (
            <div
              key={n.type}
              style={s.item}
              onMouseEnter={e => (e.currentTarget.style.background = '#2a2d3e')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={() => { onSelect(n.type, ''); onClose(); }}
            >
              <span style={s.itemIcon}>{n.icon}</span>
              <div>
                <div style={s.itemLabel}>{highlight(n.label, query)}</div>
                <div style={s.itemDesc}>{n.desc}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function highlight(text, query) {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#3b82f6', color: '#fff', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const s = {
  wrap: {
    position: 'fixed',
    zIndex: 2000,
    width: 240,
    background: '#1e2030',
    border: '1px solid #3a3f55',
    borderRadius: 10,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  header: {
    padding: '10px 12px',
    borderBottom: '1px solid #3a3f55',
  },
  list: { maxHeight: 340, overflowY: 'auto' },
  headerTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    width: '100%',
    background: '#12131a',
    border: '1px solid #3a3f55',
    borderRadius: 6,
    color: '#e2e8f0',
    fontSize: 13,
    padding: '6px 10px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  empty: {
    padding: '16px 12px',
    color: '#718096',
    fontSize: 13,
    textAlign: 'center',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  itemIcon: { fontSize: 20, flexShrink: 0 },
  itemLabel: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  itemDesc: { fontSize: 11, color: '#718096', marginTop: 1 },
};
