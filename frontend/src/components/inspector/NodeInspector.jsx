/**
 * Codex developer notes:
 * Инспектор настроек NodeInspector: форма редактирования data для выбранной ноды.
 * Инспектор не должен напрямую сохранять бота на сервер: он меняет локальное состояние редактора, а сохранение делает страница редактора.
 * При добавлении полей нужно обновлять defaults, визуальную ноду, симулятор/runtime и проверки сценария.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

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
import { AchievementInspector, AchievementsViewInspector, BreakLoopInspector, CodexInspector, EditCodexInspector, EditMessageInspector, FormulaInspector, GlobalVariableInspector, HttpRequestInspector, InventoryInspector, InventoryViewInspector, InvokeCommandInspector, LocationInspector, LoopInspector, PollInspector, PromocodeInspector, PurchaseInspector, RandomInspector, RelationInspector, ReputationStatusInspector, ResetProgressInspector, ReturnInspector, StickerInspector, SubscenarioInspector, SubscriptionCheckInspector, TextInputInspector, UnlockCodexInspector } from './GameplayInspectors';
import NodeHistoryPanel from './NodeHistoryPanel';

function InspectorBody({ node, onUpdate, botVariables, allBotVariables, placeholderVariables, botId, nodes, edges, onRenameVariable }) {
  const noop = () => {};
  const upd = onUpdate || noop;
  return (
    <PlaceholderProvider botVariables={placeholderVariables || allBotVariables || botVariables}>
    <div>
      {node.type === 'messageChainNode'  && <MessageChainInspector  data={node.data} onUpdate={p => upd(node.id, p)} botId={botId} />}
      {node.type === 'startNode'         && <StartInspector         data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'applicationNode'   && <ApplicationInspector   data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'delayNode'         && <DelayInspector         data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'simpleMessageNode' && <SimpleMessageInspector data={node.data} onUpdate={p => upd(node.id, p)} botId={botId} />}
      {node.type === 'variableNode'      && <VariableInspector      data={node.data} onUpdate={p => upd(node.id, p)} botVariables={allBotVariables} onRenameVariable={onRenameVariable} />}
      {node.type === 'keyboardNode'      && <KeyboardInspector      data={node.data} onUpdate={p => upd(node.id, p)} botVariables={allBotVariables || botVariables} placeholderVariables={placeholderVariables} nodes={nodes} />}
      {node.type === 'branchingNode'    && <BranchingInspector    data={node.data} onUpdate={p => upd(node.id, p)} botVariables={botVariables} nodes={nodes} />}
      {node.type === 'commentNode'      && <CommentInspector      data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'mediaNode'        && <MediaInspector        data={node.data} onUpdate={p => upd(node.id, p)} botId={botId} />}
      {node.type === 'inventoryNode'    && <InventoryInspector    data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'inventoryViewNode' && <InventoryViewInspector data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'formulaNode'      && <FormulaInspector      data={node.data} onUpdate={p => upd(node.id, p)} botVariables={botVariables} />}
      {node.type === 'randomNode'       && <RandomInspector       data={node.data} onUpdate={p => upd(node.id, p)} />}
{node.type === 'resetProgressNode' && <ResetProgressInspector data={node.data} onUpdate={p => upd(node.id, p)} botVariables={allBotVariables || botVariables} />}
      {node.type === 'relationNode'     && <RelationInspector     data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'achievementNode'  && <AchievementInspector  data={node.data} onUpdate={p => upd(node.id, p)} botVariables={allBotVariables || botVariables} />}
      {node.type === 'achievementsViewNode' && <AchievementsViewInspector data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'promocodeNode'    && <PromocodeInspector    data={node.data} onUpdate={p => upd(node.id, p)} nodes={nodes} botVariables={botVariables} />}
      {node.type === 'subscenarioNode'      && <SubscenarioInspector      data={node.data} onUpdate={p => upd(node.id, p)} nodes={nodes} />}
      {node.type === 'returnNode'           && <ReturnInspector           data={node.data} onUpdate={p => upd(node.id, p)} nodes={nodes} />}
      {node.type === 'invokeCommandNode'    && <InvokeCommandInspector    data={node.data} onUpdate={p => upd(node.id, p)} nodes={nodes} />}
      {node.type === 'textInputNode'        && <TextInputInspector        data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'editMessageNode'       && <EditMessageInspector       data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'pollNode'              && <PollInspector              data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'stickerNode'           && <StickerInspector           data={node.data} onUpdate={p => upd(node.id, p)} botId={botId} />}
      {node.type === 'locationNode'          && <LocationInspector          data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'subscriptionCheckNode' && <SubscriptionCheckInspector data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'httpRequestNode'      && <HttpRequestInspector      data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'loopNode'             && <LoopInspector             data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'breakLoopNode'        && <BreakLoopInspector        data={node.data} onUpdate={p => upd(node.id, p)} nodes={nodes} />}
      {node.type === 'globalVariableNode'   && <GlobalVariableInspector   data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'codexNode'            && <CodexInspector            data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'editCodexNode'        && <EditCodexInspector        data={node.data} onUpdate={p => upd(node.id, p)} nodes={nodes} edges={edges} nodeId={node.id} />}
      {node.type === 'unlockCodexNode'      && <UnlockCodexInspector      data={node.data} onUpdate={p => upd(node.id, p)} nodes={nodes} />}
      {node.type === 'reputationStatusNode' && <ReputationStatusInspector data={node.data} onUpdate={p => upd(node.id, p)} />}
      {node.type === 'purchaseNode'     && <PurchaseInspector     data={node.data} onUpdate={p => upd(node.id, p)} />}
      {['menuNode', 'settingsNode', 'customCommandNode', 'continueStoryNode'].includes(node.type) && <CommandEntryInspector type={node.type} data={node.data} onUpdate={p => upd(node.id, p)} />}
    </div>
    </PlaceholderProvider>
  );
}

function ComparePanel({ node, initialData, label, labelColor, botVariables, allBotVariables, placeholderVariables, botId, nodes }) {
  const [localData, setLocalData] = useState(initialData);
  const localNode = { ...node, data: localData };
  function handleLocalUpdate(nodeId, patch) { setLocalData(prev => ({ ...prev, ...patch })); }
  return (
    <div style={s.comparePanel}>
      <div style={{ ...s.comparePanelLabel, color: labelColor }}>{label}</div>
      <div style={s.comparePanelBody}>
        <InspectorBody node={localNode} onUpdate={handleLocalUpdate} botVariables={botVariables} allBotVariables={allBotVariables} placeholderVariables={placeholderVariables} botId={botId} nodes={nodes} />
      </div>
    </div>
  );
}

export default function NodeInspector({ node, onUpdate, onUpdateNode, onRenameVariable, onClose, botVariables, allBotVariables, placeholderVariables, botId, nodes, edges }) {
  const [showHistory, setShowHistory] = useState(false);
  const [compareData, setCompareData] = useState(null);
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
          onRequestCompare={data => { setShowHistory(false); setCompareData(data); }}
        />
      )}

      {compareData && (
        <div style={s.compareOverlay} onMouseDown={e => { if (e.target === e.currentTarget) setCompareData(null); }}>
          <div style={s.compareModal}>
            <div style={s.compareHeader}>
              <div style={s.compareTitle}>Сравнение версий · {meta.icon} {meta.label}</div>
              <button style={s.closeBtn} onClick={() => setCompareData(null)}>×</button>
            </div>
            <div style={s.comparePanels}>
              <ComparePanel node={node} initialData={compareData} label="📜 Историческая версия" labelColor="#fc8181"
                botVariables={botVariables} allBotVariables={allBotVariables} placeholderVariables={placeholderVariables} botId={botId} nodes={nodes} />
              <ComparePanel node={node} initialData={node.data} label="✅ Текущая версия" labelColor="#68d391"
                botVariables={botVariables} allBotVariables={allBotVariables} placeholderVariables={placeholderVariables} botId={botId} nodes={nodes} />
            </div>
          </div>
        </div>
      )}

      <div style={s.body}>
        {node.type !== 'commentNode' && node.type !== 'groupNode' && (
          <div style={s.nodeNameWrap}>
            <input
              style={s.nodeNameInput}
              value={node.data?.title || ''}
              placeholder={meta.label}
              onChange={e => onUpdate(node.id, { title: e.target.value })}
              onKeyDown={e => e.stopPropagation()}
            />
          </div>
        )}
        <InspectorBody node={node} onUpdate={onUpdate} botVariables={botVariables} allBotVariables={allBotVariables} placeholderVariables={placeholderVariables} botId={botId} nodes={nodes} edges={edges} onRenameVariable={onRenameVariable} />
        {node.type === 'groupNode' && <GroupInspector node={node} onUpdateData={p => onUpdate(node.id, p)} onUpdateStyle={style => onUpdateNode(node.id, { style: { ...node.style, ...style } })} />}

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
  nodeNameWrap: { padding: '10px 14px 6px', borderBottom: '1px solid #222436' },
  nodeNameInput: { width: '100%', boxSizing: 'border-box', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 13, fontWeight: 600, padding: '7px 10px', outline: 'none' },
  idRow: { padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 },
  idLabel: { fontSize: 11, color: '#4a5568' },
  idVal: { fontSize: 10, color: '#718096', background: '#12131a', borderRadius: 4, padding: '2px 6px', wordBreak: 'break-all', flex: 1 },
  compareOverlay: { position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: 16 },
  compareModal: { width: '100%', maxWidth: 1200, background: '#171927', border: '1px solid #343a5b', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' },
  compareHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: '#1e2030', borderBottom: '1px solid #2d3458', flexShrink: 0 },
  compareTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: 700 },
  comparePanels: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#2d3458', overflow: 'hidden' },
  comparePanel: { background: '#1a1c2a', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  comparePanelLabel: { padding: '10px 16px', fontSize: 12, fontWeight: 700, color: '#fc8181', background: '#12131a', borderBottom: '1px solid #2d3458', flexShrink: 0 },
  comparePanelBody: { flex: 1, overflowY: 'auto' },
};
