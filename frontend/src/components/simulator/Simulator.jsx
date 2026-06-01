import React, { useEffect, useMemo, useRef } from 'react';
import { useSimulator } from './useSimulator';
import ChatWindow from './ChatWindow';
import DebugPanel from './DebugPanel';
import VariablePanel from './VariablePanel';

export default function Simulator({ nodes, edges, botVariables, botName, initialNodeId, onClose }) {
  const sim = useSimulator(nodes, edges, botVariables);
  const autoStarted = useRef(false);
  const commands = useMemo(() => {
    const result = [];
    const names = new Set();
    const add = (label, nodeId) => {
      if (!nodeId || names.has(label)) return;
      names.add(label);
      result.push({ label, nodeId });
    };
    const menuNode = nodes.find(node => node.type === 'menuNode');
    const settingsNode = nodes.find(node => node.type === 'settingsNode');
    // /start → menu if present, otherwise the story root (node with no incoming edges)
    const storyRoot = menuNode || (() => {
      const hasIncoming = new Set(edges.filter(e => !e.data?.isComment).map(e => e.target));
      return nodes.find(n => !['menuNode','settingsNode','customCommandNode','commentNode','groupNode'].includes(n.type) && !hasIncoming.has(n.id));
    })();
    add('/start', storyRoot?.id);
    add('/settings', settingsNode?.id);
    nodes
      .filter(node => node.type === 'customCommandNode' && node.data.command && node.data.showInMenu !== false)
      .forEach(node => add(`/${String(node.data.command).replace(/^\/+/, '')}`, node.id));
    return result;
  }, [nodes]);

  useEffect(() => {
    if (initialNodeId && !autoStarted.current) {
      autoStarted.current = true;
      sim.start(initialNodeId);
    }
  }, [initialNodeId, sim.start]);

  return (
    <div style={s.overlay}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.hLeft}>
          <span style={s.hIcon}>🧪</span>
          <span style={s.hTitle}>Тестирование бота</span>
          <span style={s.hName}>{botName}</span>
        </div>
        <div style={s.hActions}>
          {sim.status === 'idle' || sim.status === 'done' ? (
            <button style={s.btnRun} onClick={() => sim.start(initialNodeId)}>▶ Запустить</button>
          ) : (
            <button style={s.btnStop} onClick={sim.stop}>■ Остановить</button>
          )}
          <button style={s.btnReset} onClick={sim.reset}>↺ Сброс</button>
          <button style={s.btnClose} onClick={onClose}>× Закрыть</button>
        </div>
      </div>

      {/* Three-pane layout */}
      <div style={s.body}>
        {/* Left: Variables */}
        <div style={s.leftPane}>
          <VariablePanel runtimeVars={sim.runtimeVars} patchVar={sim.patchVar} />
        </div>

        {/* Center: Chat */}
        <div style={s.centerPane}>
          <ChatWindow
            chatMsgs={sim.chatMsgs}
            status={sim.status}
            delayInfo={sim.delayInfo}
            onSend={sim.sendUserMessage}
            onButtonClick={sim.clickButton}
            onSkipDelay={sim.skipDelay}
            commands={commands}
            onCommand={sim.runCommand}
            botName={botName}
          />
        </div>

        {/* Right: Debug */}
        <div style={s.rightPane}>
          <DebugPanel log={sim.log} curNodeId={sim.curNodeId} status={sim.status} nodes={nodes} />
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: '#0a0b12',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 20px', flexShrink: 0,
    background: '#1a1c2a', borderBottom: '1px solid #2d3458',
  },
  hLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  hIcon: { fontSize: 22 },
  hTitle: { fontSize: 16, fontWeight: 700, color: '#e2e8f0' },
  hName: { fontSize: 13, color: '#718096', background: '#12131a', borderRadius: 6, padding: '3px 10px' },
  hActions: { display: 'flex', gap: 8, alignItems: 'center' },
  btnRun:   { background: '#22c55e', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnStop:  { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnReset: { background: '#2a2d3e', color: '#a0aec0', border: '1px solid #3a3f55', borderRadius: 7, padding: '7px 16px', fontSize: 13, cursor: 'pointer' },
  btnClose: { background: 'transparent', color: '#718096', border: '1px solid #2d3458', borderRadius: 7, padding: '7px 14px', fontSize: 13, cursor: 'pointer' },
  body: { flex: 1, display: 'flex', gap: 12, padding: 12, overflow: 'hidden' },
  leftPane:   { width: 220, flexShrink: 0 },
  centerPane: { flex: 1, maxWidth: 480, margin: '0 auto' },
  rightPane:  { width: 260, flexShrink: 0 },
};
