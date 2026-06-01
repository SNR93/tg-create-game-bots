import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import CharacterCounter from './CharacterCounter';

export const PlaceholderContext = createContext([]);

export function PlaceholderProvider({ botVariables, children }) {
  const placeholders = useMemo(() => {
    return Object.keys(botVariables || {}).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [botVariables]);
  return <PlaceholderContext.Provider value={placeholders}>{children}</PlaceholderContext.Provider>;
}

function renderHighlightedText(value, placeholders) {
  const validNames = new Set(placeholders);
  const parts = [];
  const pattern = /\{\{[^{}]*\}\}|\{\{[^{}]*$/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(String(value)))) {
    if (match.index > cursor) parts.push(String(value).slice(cursor, match.index));
    const token = match[0];
    const complete = token.endsWith('}}');
    const name = token.slice(2, complete ? -2 : undefined).trim();
    parts.push(
      <span key={`${match.index}-${token}`} style={{ color: complete && validNames.has(name) ? '#68d391' : '#fc8181' }}>
        {token}
      </span>
    );
    cursor = match.index + token.length;
  }

  if (cursor < String(value).length) parts.push(String(value).slice(cursor));
  return parts;
}

export default function PlaceholderField({ as = 'input', value = '', onChange, style, maxLength, ...props }) {
  const placeholders = useContext(PlaceholderContext);
  const inputRef = useRef(null);
  const mirrorRef = useRef(null);
  const [query, setQuery] = useState(null);
  const [range, setRange] = useState(null);
  const Component = as;
  const filtered = query === null
    ? []
    : placeholders.filter(name => name.toLowerCase().includes(query.toLowerCase()));

  function inspect(nextValue, caret) {
    const before = nextValue.slice(0, caret);
    const start = before.lastIndexOf('{{');
    const close = before.lastIndexOf('}}');
    if (start <= close) {
      setQuery(null);
      setRange(null);
      return;
    }
    const typed = before.slice(start + 2);
    if (typed.includes('{') || typed.includes('}')) {
      setQuery(null);
      setRange(null);
      return;
    }
    setQuery(typed.trim());
    setRange({ start, end: caret });
  }

  function handleChange(event) {
    onChange(event);
    inspect(event.target.value, event.target.selectionStart ?? event.target.value.length);
  }

  function insert(name) {
    if (!range) return;
    const next = `${value.slice(0, range.start)}{{${name}}}${value.slice(range.end)}`;
    if (Number.isFinite(maxLength) && next.length > maxLength) return;
    onChange({ target: { value: next } });
    setQuery(null);
    setRange(null);
    requestAnimationFrame(() => {
      const caret = range.start + name.length + 4;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange?.(caret, caret);
    });
  }

  function syncScroll(event) {
    if (mirrorRef.current) {
      mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
      mirrorRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
    props.onScroll?.(event);
  }

  const fieldStyle = {
    ...style,
    position: 'relative',
    zIndex: 1,
    background: 'transparent',
    color: 'transparent',
    caretColor: '#e2e8f0',
  };
  const mirrorStyle = {
    ...style,
    ...s.mirror,
    whiteSpace: as === 'textarea' ? 'pre-wrap' : 'pre',
  };

  return (
    <div style={s.group}>
      <div style={{ ...s.wrap, background: style?.background }}>
        <div ref={mirrorRef} aria-hidden="true" style={mirrorStyle}>
          {renderHighlightedText(value, placeholders)}
        </div>
        <Component
          {...props}
          ref={inputRef}
          value={value}
          maxLength={maxLength}
          style={fieldStyle}
          onChange={handleChange}
          onScroll={syncScroll}
          onKeyDown={event => {
            event.stopPropagation();
            props.onKeyDown?.(event);
            if (event.key === 'Escape') setQuery(null);
            if (event.key === 'Enter' && filtered.length === 1) {
              event.preventDefault();
              insert(filtered[0]);
            }
          }}
          onClick={event => {
            props.onClick?.(event);
            inspect(event.target.value, event.target.selectionStart ?? event.target.value.length);
          }}
          onBlur={() => setTimeout(() => setQuery(null), 100)}
        />
        {query !== null && (
          <div style={s.dropdown}>
            {filtered.length === 0 && <div style={s.empty}>Плейсхолдеры не найдены</div>}
            {filtered.map(name => (
              <button type="button" key={name} style={s.item} onMouseDown={event => event.preventDefault()} onClick={() => insert(name)}>
                {`{{${name}}}`}
              </button>
            ))}
          </div>
        )}
      </div>
      <CharacterCounter value={value} maxLength={maxLength} />
    </div>
  );
}

const s = {
  group: { width: '100%' },
  wrap: { position: 'relative', width: '100%' },
  mirror: { position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none', color: '#e2e8f0', borderColor: 'transparent', background: 'transparent' },
  dropdown: { position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0, maxHeight: 180, overflowY: 'auto', background: '#1a1c2a', border: '1px solid #3a3f55', borderRadius: 6, boxShadow: '0 8px 20px rgba(0,0,0,0.45)' },
  item: { display: 'block', width: '100%', padding: '7px 9px', textAlign: 'left', background: 'transparent', border: 'none', color: '#a78bfa', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer' },
  empty: { padding: '7px 9px', color: '#718096', fontSize: 12 },
};
