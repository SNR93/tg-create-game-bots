import React, { useMemo } from 'react';
import { ReactFlow, Background, BackgroundVariant, MarkerType } from '@xyflow/react';
import StartNode from '../nodes/StartNode';
import ApplicationNode from '../nodes/ApplicationNode';
import MessageChainNode from '../nodes/MessageChainNode';
import ConditionNode from '../nodes/ConditionNode';
import CommentNode from '../nodes/CommentNode';
import MediaNode from '../nodes/MediaNode';
import GroupNode from '../nodes/GroupNode';
import { CommandEntryNode, ContinueStoryNode } from '../nodes/CommandEntryNode';
import { AchievementNode, CheckpointNode, FormulaNode, InventoryNode, PromocodeNode, PurchaseNode, RandomNode, RelationNode, ResetProgressNode, ReturnNode, SubscenarioNode } from '../nodes/GameplayNodes';

const nodeTypes = { startNode: StartNode, applicationNode: ApplicationNode, messageChainNode: MessageChainNode, conditionNode: ConditionNode, commentNode: CommentNode, mediaNode: MediaNode, inventoryNode: InventoryNode, formulaNode: FormulaNode, randomNode: RandomNode, checkpointNode: CheckpointNode, resetProgressNode: ResetProgressNode, relationNode: RelationNode, achievementNode: AchievementNode, promocodeNode: PromocodeNode, subscenarioNode: SubscenarioNode, returnNode: ReturnNode, purchaseNode: PurchaseNode, menuNode: CommandEntryNode, settingsNode: CommandEntryNode, customCommandNode: CommandEntryNode, continueStoryNode: ContinueStoryNode, groupNode: GroupNode };

const EDGE_BASE = { animated: false, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } };

// Diff: mark each node with a visual style
function diffNodes(snapList, curList) {
  const snapMap = new Map(snapList.map(n => [n.id, n]));
  const curMap  = new Map(curList.map(n => [n.id, n]));

  const snapshotNodes = snapList.map(n => {
    if (!curMap.has(n.id)) return { ...n, style: { ...n.style, ...ST.deleted } };          // purple: deleted
    const cur = curMap.get(n.id);
    if (nodeChanged(n, cur)) return { ...n, style: { ...n.style, ...ST.modifiedOld } };    // red: was different
    return n;
  });

  const currentNodes = curList.map(n => {
    if (!snapMap.has(n.id)) return { ...n, style: { ...n.style, ...ST.added } };           // green: new
    const snap = snapMap.get(n.id);
    if (nodeChanged(snap, n)) return { ...n, style: { ...n.style, ...ST.modifiedNew } };   // green: changed
    return n;
  });

  return { snapshotNodes, currentNodes };
}

function diffEdges(snapList, curList) {
  const snapMap = new Map(snapList.map(e => [e.id, e]));
  const curMap  = new Map(curList.map(e => [e.id, e]));

  const snapshotEdges = snapList.map(e => {
    if (!curMap.has(e.id)) return { ...e, ...EDGE_BASE, style: { stroke: '#9b59b6', strokeWidth: 2.5 }, markerEnd: { ...EDGE_BASE.markerEnd, color: '#9b59b6' } };
    const cur = curMap.get(e.id);
    if (e.source !== cur.source || e.target !== cur.target || e.sourceHandle !== cur.sourceHandle)
      return { ...e, ...EDGE_BASE, style: { stroke: '#ef4444', strokeWidth: 2.5 }, markerEnd: { ...EDGE_BASE.markerEnd, color: '#ef4444' } };
    return { ...e, ...EDGE_BASE, style: { stroke: '#4a5568', strokeWidth: 2 }, markerEnd: { ...EDGE_BASE.markerEnd, color: '#4a5568' } };
  });

  const currentEdges = curList.map(e => {
    if (!snapMap.has(e.id)) return { ...e, ...EDGE_BASE, style: { stroke: '#22c55e', strokeWidth: 2.5 }, markerEnd: { ...EDGE_BASE.markerEnd, color: '#22c55e' } };
    const snap = snapMap.get(e.id);
    if (e.source !== snap.source || e.target !== snap.target || e.sourceHandle !== snap.sourceHandle)
      return { ...e, ...EDGE_BASE, style: { stroke: '#22c55e', strokeWidth: 2.5 }, markerEnd: { ...EDGE_BASE.markerEnd, color: '#22c55e' } };
    return { ...e, ...EDGE_BASE, style: { stroke: '#4a5568', strokeWidth: 2 }, markerEnd: { ...EDGE_BASE.markerEnd, color: '#4a5568' } };
  });

  return { snapshotEdges, currentEdges };
}

function nodeChanged(a, b) {
  return JSON.stringify(a.data) !== JSON.stringify(b.data) ||
    JSON.stringify(a.style) !== JSON.stringify(b.style) ||
    a.parentId !== b.parentId ||
    Math.round(a.position.x) !== Math.round(b.position.x) ||
    Math.round(a.position.y) !== Math.round(b.position.y);
}

export default function CompareView({ snapshot, currentNodes, currentEdges, onClose }) {
  const { snapshotNodes, currentNodes: diffedCurrent } = useMemo(
    () => diffNodes(snapshot.nodes || [], currentNodes),
    [snapshot, currentNodes]
  );
  const { snapshotEdges, currentEdges: diffedCurrentEdges } = useMemo(
    () => diffEdges(snapshot.edges || [], currentEdges),
    [snapshot, currentEdges]
  );

  const snapDate = new Date(snapshot.timestamp).toLocaleString('ru');

  return (
    <div style={s.overlay}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.legend}>
          <span style={{ color: '#9b59b6' }}>■ Удалено</span>
          <span style={{ color: '#ef4444' }}>■ Изменено (было)</span>
          <span style={{ color: '#22c55e' }}>■ Добавлено / изменено (стало)</span>
          <span style={{ color: '#4a5568' }}>■ Без изменений</span>
        </div>
        <button style={s.closeBtn} onClick={onClose}>× Закрыть сравнение</button>
      </div>

      {/* Two panes */}
      <div style={s.panes}>
        {/* Left — snapshot */}
        <div style={s.pane}>
          <div style={s.paneLabel}>
            <span style={s.paneLabelText}>Снапшот · {snapDate}</span>
          </div>
          <ReactFlow
            nodes={snapshotNodes}
            edges={snapshotEdges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            style={{ background: '#0e0f18' }}
          >
            <Background variant={BackgroundVariant.Dots} color="#1e2030" gap={24} size={1} />
          </ReactFlow>
        </div>

        <div style={s.divider} />

        {/* Right — current */}
        <div style={s.pane}>
          <div style={{ ...s.paneLabel, background: 'rgba(34,197,94,0.08)' }}>
            <span style={{ ...s.paneLabelText, color: '#22c55e' }}>Текущее состояние</span>
          </div>
          <ReactFlow
            nodes={diffedCurrent}
            edges={diffedCurrentEdges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            style={{ background: '#0e0f18' }}
          >
            <Background variant={BackgroundVariant.Dots} color="#1e2030" gap={24} size={1} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

// Outline styles applied to the ReactFlow node wrapper
const BASE_OUTLINE = { borderRadius: 12, outlineOffset: 3 };
const ST = {
  deleted:     { ...BASE_OUTLINE, outline: '2px solid #9b59b6', boxShadow: '0 0 18px rgba(155,89,182,0.45)' },
  modifiedOld: { ...BASE_OUTLINE, outline: '2px solid #ef4444', boxShadow: '0 0 18px rgba(239,68,68,0.4)'   },
  added:       { ...BASE_OUTLINE, outline: '2px solid #22c55e', boxShadow: '0 0 18px rgba(34,197,94,0.4)'   },
  modifiedNew: { ...BASE_OUTLINE, outline: '2px solid #22c55e', boxShadow: '0 0 18px rgba(34,197,94,0.4)'   },
};

const s = {
  overlay: {
    position: 'absolute', inset: 0, zIndex: 20,
    display: 'flex', flexDirection: 'column',
    background: '#12131a',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '8px 16px', flexShrink: 0,
    background: '#1a1c2a', borderBottom: '1px solid #2d3458',
  },
  legend: {
    display: 'flex', gap: 16, fontSize: 12, color: '#718096', flexWrap: 'wrap',
  },
  closeBtn: {
    marginLeft: 'auto', background: '#2a2d3e', border: '1px solid #3a3f55',
    borderRadius: 6, color: '#e2e8f0', padding: '5px 14px',
    cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
  },
  panes: { flex: 1, display: 'flex', overflow: 'hidden' },
  pane:  { flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' },
  divider: { width: 2, background: '#2d3458', flexShrink: 0 },
  paneLabel: {
    position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
    zIndex: 5, pointerEvents: 'none',
    background: 'rgba(26,28,42,0.85)', border: '1px solid #3a3f55',
    borderRadius: 6, padding: '3px 14px',
  },
  paneLabelText: { fontSize: 12, color: '#a0aec0', whiteSpace: 'nowrap' },
};
