/**
 * Codex developer notes:
 * Инспектор настроек CharacterCounter: форма редактирования data для выбранной ноды.
 * Инспектор не должен напрямую сохранять бота на сервер: он меняет локальное состояние редактора, а сохранение делает страница редактора.
 * При добавлении полей нужно обновлять defaults, визуальную ноду, симулятор/runtime и проверки сценария.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';

export default function CharacterCounter({ value = '', maxLength }) {
  if (!Number.isFinite(maxLength)) return null;
  const used = String(value).length;
  const remaining = maxLength - used;
  return (
    <div style={{ ...s.counter, color: remaining < 0 ? '#fc8181' : '#718096' }}>
      {used} / {maxLength} символов · осталось {Math.max(0, remaining)}
    </div>
  );
}

const s = {
  counter: { marginTop: 4, fontSize: 10, lineHeight: 1.35, textAlign: 'right' },
};
