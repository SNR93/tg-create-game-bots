/**
 * Codex developer notes:
 * Инспектор настроек NodeHelp: форма редактирования data для выбранной ноды.
 * Инспектор не должен напрямую сохранять бота на сервер: он меняет локальное состояние редактора, а сохранение делает страница редактора.
 * При добавлении полей нужно обновлять defaults, визуальную ноду, симулятор/runtime и проверки сценария.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';
import { getNodeMeta } from '../nodes/nodeCatalog';

export default function NodeHelp({ type }) {
  const meta = getNodeMeta(type);
  return (
    <details style={s.wrap}>
      <summary style={s.summary}>? Подробная подсказка по ноде</summary>
      <div style={s.body}>
        <div style={s.title}>{meta.icon} {meta.label}</div>
        <p style={s.text}>{meta.purpose}</p>
        {meta.when && <Info title="Когда использовать">{meta.when}</Info>}
        {meta.nuances?.length > 0 && (
          <Info title="Важные нюансы">
            <ul style={s.list}>{meta.nuances.map(item => <li key={item}>{item}</li>)}</ul>
          </Info>
        )}
        {meta.example && <Info title="Пример">{meta.example}</Info>}
      </div>
    </details>
  );
}

function Info({ title, children }) {
  return <div style={s.info}><div style={s.infoTitle}>{title}</div><div>{children}</div></div>;
}

const s = {
  wrap: { margin: '10px 12px 12px', border: '1px solid #343a5b', borderRadius: 7, background: '#141622', overflow: 'hidden' },
  summary: { padding: '9px 10px', color: '#c4b5fd', fontSize: 12, fontWeight: 700, cursor: 'pointer', userSelect: 'none' },
  body: { padding: '0 11px 11px', color: '#a0aec0', fontSize: 12, lineHeight: 1.55 },
  title: { color: '#e2e8f0', fontSize: 13, fontWeight: 700, marginTop: 3 },
  text: { margin: '6px 0 9px' },
  info: { marginTop: 8, paddingTop: 7, borderTop: '1px solid #272b42' },
  infoTitle: { color: '#718096', fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 3 },
  list: { margin: 0, paddingLeft: 17 },
};
