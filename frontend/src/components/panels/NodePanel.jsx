/**
 * Codex developer notes:
 * Панель интерфейса NodePanel: отдельная рабочая область редактора или админского инструмента.
 * Панель держит локальные UI-состояния, но долгоживущие данные получает через props или API-клиент.
 * Изменения здесь часто влияют на UX, поэтому проверяй переполнение текста и поведение на узких экранах.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';
import { ADDABLE_NODES, NODE_CATEGORIES } from '../nodes/nodeCatalog';

export default function NodePanel({ onAddNode }) {
  return (
    <div style={s.panel}>
      <div style={s.title}>Добавить блок</div>
      {NODE_CATEGORIES.map(category => (
        <div key={category.id}>
          <div style={s.category}>{category.label}</div>
          {ADDABLE_NODES.filter(node => node.category === category.id).map(n => (
            <div key={n.type} style={s.item}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#3a3f55'}
              onClick={() => onAddNode(n.type)}>
              <span style={s.icon}>{n.icon}</span>
              <div>
                <div style={s.name}>{n.label}</div>
                <div style={s.desc}>{n.desc}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const s = {
  panel: { width: 215, background: '#1a1c2a', borderRight: '1px solid #2d3458', padding: '14px 10px', overflowY: 'auto' },
  title: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, padding: '0 4px' },
  category: { margin: '14px 4px 6px', color: '#4f5b78', fontSize: 10, fontWeight: 700, letterSpacing: 0.75, textTransform: 'uppercase' },
  item:  { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6, padding: '8px 9px', background: '#2a2d3e', borderRadius: 8, border: '1px solid #3a3f55', cursor: 'pointer', transition: 'border-color 0.15s' },
  icon:  { fontSize: 18, flexShrink: 0 },
  name:  { fontSize: 12, fontWeight: 600, color: '#e2e8f0' },
  desc:  { fontSize: 10, color: '#718096', marginTop: 2 },
};
