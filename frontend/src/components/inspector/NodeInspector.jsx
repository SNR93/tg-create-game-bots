import React, { useState } from 'react';
import MessageChainInspector from './MessageChainInspector';
import StartInspector from './StartInspector';
import ApplicationInspector from './ApplicationInspector';
import DelayInspector from './DelayInspector';
import SimpleMessageInspector from './SimpleMessageInspector';
import VariableInspector from './VariableInspector';
import KeyboardInspector from './KeyboardInspector';
import BranchingInspector from './BranchingInspector';
import CommentInspector from './CommentInspector';
import MediaInspector from './MediaInspector';
import CommandEntryInspector from './CommandEntryInspector';
import GroupInspector from './GroupInspector';
import NodeHelp from './NodeHelp';
import { PlaceholderProvider } from './PlaceholderField';
import { getNodeMeta } from '../nodes/nodeCatalog';
import { AchievementInspector, AchievementsViewInspector, BreakLoopInspector, CheckpointInspector, EditMessageInspector, FormulaInspector, GlobalVariableInspector, HttpRequestInspector, InventoryInspector, InventoryViewInspector, InvokeCommandInspector, LocationInspector, LoopInspector, PollInspector, PromocodeInspector, PurchaseInspector, RandomInspector, RelationInspector, ReturnInspector, StickerInspector, SubscenarioInspector, SubscriptionCheckInspector, TextInputInspector } from './GameplayInspectors';
import NodeHistoryPanel from './NodeHistoryPanel';

export default function NodeInspector({ node, onUpdate, onUpdateNode, onClose, botVariables, allBotVariables, placeholderVariables, botId, nodes }) {
  const [showHistory, setShowHistory] = useState(false);
  if (!node) return null;
  const meta = getNodeMeta(node.type);

  // Current variable values for display
  const varEntries = Object.entries(botVariables || {});

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <div style={s.hLeft}>
          <span style={s.hIcon}>{meta.icon}</span>
          <div>
            <div style={s.hTitle}>Настройки блока</div>
            <div style={s.hSub}>{meta.label}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {botId && (
            <button style={s.historyBtn} title="История изменений" onClick={() => setShowHistory(true)}>
              🕐
            </button>
          )}
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>
      </div>
      {showHistory && botId && (
        <NodeHistoryPanel
          node={node}
          botId={botId}
          currentData={node.data}
          onRestore={data => onUpdate(node.id, data)}
          onClose={() => setShowHistory(false)}
        />
      )}

      <PlaceholderProvider botVariables={placeholderVariables || allBotVariables || botVariables}>
      <div style={s.body}>
        {node.type === 'messageChainNode'  && <MessageChainInspector  data={node.data} onUpdate={p => onUpdate(node.id, p)} botId={botId} />}
        {node.type === 'startNode'         && <StartInspector         data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'applicationNode'   && <ApplicationInspector   data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'delayNode'         && <DelayInspector         data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'simpleMessageNode' && <SimpleMessageInspector data={node.data} onUpdate={p => onUpdate(node.id, p)} botId={botId} />}
        {node.type === 'variableNode'      && <VariableInspector      data={node.data} onUpdate={p => onUpdate(node.id, p)} botVariables={allBotVariables} />}
        {node.type === 'keyboardNode'      && <KeyboardInspector      data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'branchingNode'    && <BranchingInspector    data={node.data} onUpdate={p => onUpdate(node.id, p)} botVariables={botVariables} />}
        {node.type === 'commentNode'      && <CommentInspector      data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'mediaNode'        && <MediaInspector        data={node.data} onUpdate={p => onUpdate(node.id, p)} botId={botId} />}
        {node.type === 'inventoryNode'    && <InventoryInspector    data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'inventoryViewNode' && <InventoryViewInspector data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'formulaNode'      && <FormulaInspector      data={node.data} onUpdate={p => onUpdate(node.id, p)} botVariables={botVariables} />}
        {node.type === 'randomNode'       && <RandomInspector       data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'checkpointNode'   && <CheckpointInspector   data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'relationNode'     && <RelationInspector     data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'achievementNode'  && <AchievementInspector  data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'achievementsViewNode' && <AchievementsViewInspector data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'promocodeNode'    && <PromocodeInspector    data={node.data} onUpdate={p => onUpdate(node.id, p)} nodes={nodes} botVariables={botVariables} />}
        {node.type === 'subscenarioNode'      && <SubscenarioInspector      data={node.data} onUpdate={p => onUpdate(node.id, p)} nodes={nodes} />}
        {node.type === 'returnNode'           && <ReturnInspector           data={node.data} onUpdate={p => onUpdate(node.id, p)} nodes={nodes} />}
        {node.type === 'invokeCommandNode'    && <InvokeCommandInspector    data={node.data} onUpdate={p => onUpdate(node.id, p)} nodes={nodes} />}
        {node.type === 'textInputNode'        && <TextInputInspector        data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'editMessageNode'       && <EditMessageInspector       data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'pollNode'              && <PollInspector              data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'stickerNode'           && <StickerInspector           data={node.data} onUpdate={p => onUpdate(node.id, p)} botId={botId} />}
        {node.type === 'locationNode'          && <LocationInspector          data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'subscriptionCheckNode' && <SubscriptionCheckInspector data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'httpRequestNode'      && <HttpRequestInspector      data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'loopNode'             && <LoopInspector             data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'breakLoopNode'        && <BreakLoopInspector        data={node.data} onUpdate={p => onUpdate(node.id, p)} nodes={nodes} />}
        {node.type === 'globalVariableNode'   && <GlobalVariableInspector   data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'purchaseNode'     && <PurchaseInspector     data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {['menuNode', 'settingsNode', 'customCommandNode', 'continueStoryNode'].includes(node.type) && <CommandEntryInspector type={node.type} data={node.data} onUpdate={p => onUpdate(node.id, p)} />}
        {node.type === 'groupNode'         && <GroupInspector node={node} onUpdateData={p => onUpdate(node.id, p)} onUpdateStyle={style => onUpdateNode(node.id, { style: { ...node.style, ...style } })} />}

        {/* Variables overview */}
        {varEntries.length > 0 && (
          <div style={s.varSection}>
            <div style={s.varTitle}>📦 Доступны в этой точке</div>
            {varEntries.map(([name, v]) => (
              <div key={name} style={s.varRow}>
                <span style={s.varName}>{name}</span>
                <span style={s.varType}>{v.type}</span>
                <span style={s.varVal}>{String(v.defaultValue ?? (v.type === 'number' ? 0 : false))}</span>
              </div>
            ))}
          </div>
        )}

        <NodeHelp type={node.type} />

        {/* ID */}
        <div style={s.idRow}>
          <span style={s.idLabel}>ID:</span>
          <code style={s.idVal}>{node.id}</code>
        </div>
      </div>
      </PlaceholderProvider>
    </div>
  );
}

const s = {
  panel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: 420,
    background: '#1a1c2a', borderLeft: '1px solid #2d3458',
    zIndex: 10, display: 'flex', flexDirection: 'column',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid #2d3458', flexShrink: 0,
    background: '#1e2030',
  },
  hLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  hIcon: { fontSize: 22 },
  hTitle: { fontSize: 14, fontWeight: 700, color: '#e2e8f0' },
  hSub: { fontSize: 11, color: '#718096', marginTop: 1 },
  closeBtn: { background: 'transparent', border: 'none', color: '#718096', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 },
  historyBtn: { background: 'transparent', border: '1px solid #2d3458', borderRadius: 6, color: '#a0aec0', fontSize: 16, cursor: 'pointer', padding: '3px 7px', flexShrink: 0, title: 'История' },
  body: { flex: 1, overflowY: 'auto' },
  varSection: { padding: '12px 16px', borderTop: '1px solid #222436', borderBottom: '1px solid #222436' },
  varTitle: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  varRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 },
  varName: { color: '#a78bfa', fontWeight: 600, flex: 1 },
  varType: { color: '#4a5568', fontSize: 10 },
  varVal: { color: '#f6ad55', fontWeight: 600 },
  idRow: { padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 },
  idLabel: { fontSize: 11, color: '#4a5568' },
  idVal: { fontSize: 10, color: '#718096', background: '#12131a', borderRadius: 4, padding: '2px 6px', wordBreak: 'break-all', flex: 1 },
};
