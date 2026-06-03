import React, { useMemo, useRef } from 'react';

function parseLinks(text) {
  const links = [];
  const pattern = /<a\s+data-lore-title="([^"]*)">([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(text || ''))) {
    links.push({
      title: match[1] || match[2],
      label: match[2].replace(/<[^>]+>/g, '').slice(0, 80),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return links;
}

function renderLoreText(text) {
  const pattern = /<a\s+data-lore-title="([^"]*)">([\s\S]*?)<\/a>/g;
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text || ''))) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    parts.push(
      <span key={match.index} style={{ color: '#93c5fd', borderBottom: '1px solid rgba(147,197,253,0.5)' }}>
        {match[2]}
      </span>
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < (text || '').length) parts.push((text || '').slice(cursor));
  return parts;
}

export default function LoreModal({ lore, onChange, onClose }) {
  const textareaRef = useRef(null);
  const mirrorRef = useRef(null);
  const text = lore?.text || '';
  const links = useMemo(() => parseLinks(text), [text]);

  function update(nextText) {
    onChange({ ...(lore || {}), text: nextText });
  }

  function addLink() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    if (start === end) return alert('Выделите слово или фразу для ссылки.');
    const title = prompt('Название ссылки:', text.slice(start, end).trim());
    if (!title) return;
    const safeTitle = title.replace(/"/g, '&quot;');
    const selected = text.slice(start, end);
    const next = `${text.slice(0, start)}<a data-lore-title="${safeTitle}">${selected}</a>${text.slice(end)}`;
    update(next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start, start + next.length - text.length);
    });
  }

  function jump(link) {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(link.start, link.end);
    const before = text.slice(0, link.start);
    const line = before.split('\n').length;
    textareaRef.current.scrollTop = Math.max(0, (line - 4) * 20);
  }

  function syncScroll(event) {
    if (mirrorRef.current) {
      mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  return (
    <div style={s.overlay} onMouseDown={onClose}>
      <div style={s.modal} onMouseDown={event => event.stopPropagation()}>
        <aside style={s.sidebar}>
          <div style={s.sideTitle}>Ссылки</div>
          {links.length === 0 && <div style={s.empty}>Выделите текст и нажмите «Ссылка».</div>}
          {links.map((link, index) => (
            <button key={`${link.start}-${index}`} type="button" style={s.linkItem} onClick={() => jump(link)}>
              <span style={s.linkTitle}>{link.title}</span>
              <span style={s.linkLabel}>{link.label}</span>
            </button>
          ))}
        </aside>
        <section style={s.main}>
          <header style={s.header}>
            <div>
              <div style={s.eyebrow}>Материалы проекта</div>
              <div style={s.title}>Лор</div>
            </div>
            <div style={s.actions}>
              <button type="button" style={s.toolbarBtn} onClick={addLink}>Ссылка</button>
              <button type="button" style={s.close} onClick={onClose}>×</button>
            </div>
          </header>
          <div style={s.editorWrap}>
            {/* Mirror layer — shows lore links in blue */}
            <div
              ref={mirrorRef}
              aria-hidden="true"
              style={s.mirror}
            >
              {renderLoreText(text)}
            </div>
            <textarea
              ref={textareaRef}
              style={s.textarea}
              value={text}
              placeholder="Пишите заметки, описания мира, персонажей, предметов и веток сюжета..."
              onChange={event => update(event.target.value)}
              onKeyDown={event => event.stopPropagation()}
              onScroll={syncScroll}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const EDITOR_STYLE = {
  flex: 1,
  resize: 'none',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 15,
  lineHeight: 1.65,
  padding: 22,
  fontFamily: 'inherit',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'break-word',
  boxSizing: 'border-box',
  width: '100%',
};

const s = {
  overlay: { position: 'fixed', inset: 0, zIndex: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,6,16,0.78)', padding: 22 },
  modal: { width: 'min(1080px, 96vw)', height: 'min(760px, 90vh)', display: 'flex', overflow: 'hidden', background: '#171927', border: '1px solid #343a5b', borderRadius: 12, boxShadow: '0 22px 70px rgba(0,0,0,0.65)' },
  sidebar: { width: 250, flexShrink: 0, padding: 14, background: '#111827', borderRight: '1px solid #2d3458', overflowY: 'auto' },
  sideTitle: { color: '#e2e8f0', fontSize: 13, fontWeight: 800, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  empty: { color: '#64748b', fontSize: 12, lineHeight: 1.5 },
  linkItem: { display: 'block', width: '100%', textAlign: 'left', background: '#1e2030', border: '1px solid #2d3458', borderRadius: 7, color: '#cbd5e1', padding: 9, marginBottom: 7, cursor: 'pointer' },
  linkTitle: { display: 'block', color: '#93c5fd', fontSize: 12, fontWeight: 800, marginBottom: 2 },
  linkLabel: { display: 'block', color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid #2d3458', background: '#1e2030' },
  eyebrow: { color: '#818cf8', fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: 800 },
  actions: { display: 'flex', alignItems: 'center', gap: 8 },
  toolbarBtn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  close: { background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 28, cursor: 'pointer' },
  editorWrap: { flex: 1, position: 'relative', display: 'flex', background: '#12131a' },
  mirror: {
    ...EDITOR_STYLE,
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    color: '#e2e8f0',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  textarea: {
    ...EDITOR_STYLE,
    position: 'relative',
    zIndex: 1,
    color: 'transparent',
    caretColor: '#e2e8f0',
    overflowY: 'auto',
  },
};
