/**
 * Codex developer notes:
 * Часть встроенного симулятора DebugPanel: проигрывание сценария без реального Telegram-бота.
 * Симулятор повторяет ключевые правила runtime на frontend, чтобы автор мог быстро проверить ветки и переменные.
 * При изменении игровой логики важно синхронизировать этот код с backend/telegramRuntime.js.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React, { useEffect, useRef } from 'react';

const KIND_COLOR = { node:'#38bdf8', msg:'#22c55e', delay:'#f6ad55', condition:'#a78bfa', var:'#fb923c', wait:'#718096', done:'#4fd1c5', error:'#ef4444', skip:'#4a5568', notification:'#60a5fa' };
const KIND_ICON  = { node:'→', msg:'💬', delay:'⏱', condition:'⚡', var:'📦', wait:'⌛', done:'✓', error:'✗', skip:'⇢', notification:'🔔' };

export default function DebugPanel({ log, curNodeId, status, nodes }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

  const curNode = curNodeId ? nodes.find(n => n.id === curNodeId) : null;

  const STATUS_LABEL = { idle: '⏸ Остановлен', running: '▶ Выполняется', waiting_input: '⌛ Ожидание ввода', delay: '⏱ Задержка', done: '✓ Завершён' };

  return (
    <div style={s.panel}>
      <div style={s.title}>🐛 Отладка</div>

      {/* Current node */}
      <div style={s.section}>
        <div style={s.sLabel}>Текущий блок</div>
        {curNode ? (
          <div style={s.curNode}>
            <div style={s.curType}>{curNode.type}</div>
            <div style={s.curId}>{curNode.id.slice(0, 12)}...</div>
          </div>
        ) : <div style={s.na}>—</div>}
      </div>

      {/* Status */}
      <div style={s.section}>
        <div style={s.sLabel}>Статус</div>
        <div style={s.status}>{STATUS_LABEL[status] || status}</div>
      </div>

      {/* Log */}
      <div style={s.section}>
        <div style={s.sLabel}>Лог выполнения</div>
      </div>
      <div style={s.log}>
        {log.length === 0 && <div style={s.logEmpty}>Лог пуст</div>}
        {log.map(entry => (
          <div key={entry.id} style={s.logRow}>
            <span style={s.logTime}>{entry.ts}</span>
            <span style={{ ...s.logIcon, color: KIND_COLOR[entry.kind] || '#718096' }}>
              {KIND_ICON[entry.kind] || '·'}
            </span>
            <span style={{ ...s.logMsg, color: KIND_COLOR[entry.kind] || '#a0aec0' }}>
              {entry.msg}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const s = {
  panel: { display: 'flex', flexDirection: 'column', height: '100%', background: '#1a1c2a', borderRadius: 10, overflow: 'hidden' },
  title: { padding: '12px 16px', borderBottom: '1px solid #2d3458', fontWeight: 700, fontSize: 14, color: '#e2e8f0', flexShrink: 0 },
  section: { padding: '10px 14px', borderBottom: '1px solid #222436', flexShrink: 0 },
  sLabel: { fontSize: 10, fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  curNode: { background: '#12131a', borderRadius: 6, padding: '6px 10px' },
  curType: { fontSize: 13, fontWeight: 600, color: '#38bdf8' },
  curId:   { fontSize: 10, color: '#4a5568', marginTop: 2 },
  na: { color: '#4a5568', fontSize: 13 },
  status: { fontSize: 13, color: '#a0aec0' },
  log: { flex: 1, overflowY: 'auto', padding: '6px 8px' },
  logEmpty: { color: '#4a5568', fontSize: 12, textAlign: 'center', padding: '20px 0' },
  logRow: { display: 'flex', gap: 6, alignItems: 'flex-start', padding: '3px 4px', borderRadius: 4, marginBottom: 2 },
  logTime: { fontSize: 10, color: '#4a5568', flexShrink: 0, marginTop: 2 },
  logIcon: { fontSize: 12, flexShrink: 0, marginTop: 1 },
  logMsg:  { fontSize: 12, lineHeight: 1.4, wordBreak: 'break-word' },
};
