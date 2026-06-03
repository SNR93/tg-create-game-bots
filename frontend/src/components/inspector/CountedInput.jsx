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
