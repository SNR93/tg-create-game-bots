import React, { createContext, useContext } from 'react';

export const NodeDebugContext = createContext(null);

export function withNodeDebug(NodeComponent) {
  return function DebuggableNode(props) {
    const onDebugStart = useContext(NodeDebugContext);

    return (
      <div className={props.data?.__expanded ? 'node-expanded' : undefined} style={s.wrap}>
        <NodeComponent {...props} />
        {onDebugStart && (
          <button
            className="nodrag nowheel"
            type="button"
            title="Запустить тест с этой ноды"
            style={s.play}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation();
              onDebugStart(props.id);
            }}
          >
            ▶
          </button>
        )}
      </div>
    );
  };
}

const s = {
  wrap: { position: 'relative' },
  play: {
    position: 'absolute', top: 5, right: 7, zIndex: 4,
    width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1e293b', border: '1px solid #38bdf8', borderRadius: 5,
    color: '#38bdf8', cursor: 'pointer', fontSize: 10, lineHeight: 1, padding: 0,
  },
};
