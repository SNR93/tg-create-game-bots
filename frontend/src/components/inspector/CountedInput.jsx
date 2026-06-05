/**
 * Codex developer notes:
 * Инспектор настроек CountedInput: форма редактирования data для выбранной ноды.
 * Инспектор не должен напрямую сохранять бота на сервер: он меняет локальное состояние редактора, а сохранение делает страница редактора.
 * При добавлении полей нужно обновлять defaults, визуальную ноду, симулятор/runtime и проверки сценария.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';
import CharacterCounter from './CharacterCounter';

export default function CountedInput({ value = '', maxLength, style, groupStyle, onKeyDown, showCounter = false, ...props }) {
  return (
    <div style={{ ...s.group, ...groupStyle }}>
      <input
        {...props}
        value={value}
        maxLength={maxLength}
        style={style}
        onKeyDown={event => {
          event.stopPropagation();
          onKeyDown?.(event);
        }}
      />
      {showCounter && <CharacterCounter value={value} maxLength={maxLength} />}
    </div>
  );
}

const s = {
  group: { width: '100%', minWidth: 0 },
};
