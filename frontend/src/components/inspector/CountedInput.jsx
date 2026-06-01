import React from 'react';
import CharacterCounter from './CharacterCounter';

export default function CountedInput({ value = '', maxLength, style, groupStyle, onKeyDown, ...props }) {
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
      <CharacterCounter value={value} maxLength={maxLength} />
    </div>
  );
}

const s = {
  group: { width: '100%', minWidth: 0 },
};
