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
