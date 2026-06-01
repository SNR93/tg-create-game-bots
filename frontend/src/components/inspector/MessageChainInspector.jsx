import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { makeMessage } from '../nodes/MessageChainNode';
import { uploadBotMedia } from '../../api';
import PlaceholderField from './PlaceholderField';
import CharacterCounter from './CharacterCounter';
import { EDITOR_LIMITS, TELEGRAM_LIMITS, mediaRuleText, validateVideoNoteDuration } from '../../telegramLimits';

const TYPES = [
  { key: 'text',     icon: '✎',  label: 'Текст'         },
  { key: 'photo',    icon: '🖼', label: 'Фото'           },
  { key: 'video',    icon: '▶',  label: 'Видео'          },
  { key: 'voice',    icon: '🎤', label: 'Голосовое'      },
  { key: 'audio',    icon: '🎵', label: 'Аудио (музыка)' },
  { key: 'document', icon: '📄', label: 'Документ'       },
];

export default function MessageChainInspector({ data, onUpdate, botId }) {
  const messages = data.messages || [];

  function updMessages(msgs) { onUpdate({ messages: msgs }); }

  function addMsg(type) {
    updMessages([...messages, makeMessage(type)]);
  }

  function delMsg(id) {
    updMessages(messages.filter(m => m.id !== id));
  }

  function patchMsg(id, patch) {
    updMessages(messages.map(m => m.id === id ? { ...m, ...patch } : m));
  }

  function move(id, dir) {
    const arr = [...messages];
    const i = arr.findIndex(m => m.id === id);
    if (dir === 'up'   && i > 0)              [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    if (dir === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
    updMessages(arr);
  }

  return (
    <div>
      {/* Node title */}
      <Section label="Название блока">
        <InpText
          value={data.title || ''}
          maxLength={EDITOR_LIMITS.title}
          placeholder="Цепочка сообщений"
          onChange={v => onUpdate({ title: v })}
        />
      </Section>

      {/* Messages list */}
      <Section label={`Сообщения (${messages.length})`}>
        {messages.length === 0 && (
          <div style={s.empty}>Нет сообщений. Добавьте ниже.</div>
        )}
        {messages.map((msg, i) => (
          <MessageCard
            key={msg.id} msg={msg} index={i} total={messages.length}
            onPatch={p => patchMsg(msg.id, p)}
            onDelete={() => delMsg(msg.id)}
            onMove={dir => move(msg.id, dir)}
            botId={botId}
          />
        ))}
      </Section>

      {/* Add buttons */}
      <Section label="Добавить сообщение">
        <div style={s.addGrid}>
          {TYPES.map(t => (
            <button key={t.key} style={s.addBtn} onClick={() => addMsg(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function MessageCard({ msg, index, total, onPatch, onDelete, onMove, botId }) {
  const type = TYPES.find(t => t.key === msg.type) || TYPES[0];
  const [open, setOpen] = useState(true);

  return (
    <div style={s.card}>
      {/* Card header */}
      <div style={s.cardHead}>
        <button style={s.collapseBtn} onClick={() => setOpen(v => !v)}>
          {open ? '▾' : '▸'}
        </button>
        <span style={s.cardType}>{type.icon} {type.label}</span>
        <div style={s.cardMeta}>
          {msg.delay > 0 && <span style={s.delayBadge}>{msg.delay}с</span>}
          <button style={s.moveBtn} onClick={() => onMove('up')}   disabled={index === 0}>↑</button>
          <button style={s.moveBtn} onClick={() => onMove('down')} disabled={index === total - 1}>↓</button>
          <button style={{ ...s.moveBtn, color: '#fc8181' }} onClick={onDelete}>✕</button>
        </div>
      </div>

      {open && (
        <div style={s.cardBody}>
          {/* Type selector */}
          <div style={s.typeGrid}>
            {TYPES.map(t => (
              <button
                key={t.key}
                style={{ ...s.typeBtn, background: msg.type === t.key ? '#3b82f6' : '#2a2d3e', color: msg.type === t.key ? '#fff' : '#a0aec0' }}
                onClick={() => onPatch({ type: t.key })}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {msg.type === 'text' ? (
            <PlaceholderField as="textarea"
              style={s.textarea}
              value={msg.text || ''}
              placeholder="Введите текст сообщения..."
              rows={4}
              maxLength={TELEGRAM_LIMITS.messageText}
              onChange={e => onPatch({ text: e.target.value })}
              onKeyDown={e => e.stopPropagation()}
            />
          ) : (
            <div>
              <InpText
                value={msg.url || ''}
                maxLength={EDITOR_LIMITS.url}
                placeholder="URL файла (https://...)"
                onChange={v => onPatch({ url: v })}
              />
              <FileInput botId={botId} type={msg.type} accept={fileAccept(msg.type)} onFile={uploaded => onPatch(uploaded)} />
              {msg.fileName && <div style={s.fileName}>📎 {msg.fileName}</div>}
              <div style={s.note}>{mediaRuleText(msg.type, msg.asVideoNote)}</div>
            </div>
          )}

          {/* Protected */}
          {msg.type === 'video' && (
            <label style={s.protectedRow}>
              <input type="checkbox" checked={!!msg.asVideoNote}
                onChange={e => {
                  const error = e.target.checked ? validateVideoNoteDuration(msg.duration) : '';
                  if (error) return alert(error);
                  onPatch({ asVideoNote: e.target.checked });
                }} />
              <span>Отправить видео как кружок</span>
            </label>
          )}
          <label style={s.protectedRow}>
            <input type="checkbox" checked={!!msg.protected}
              onChange={e => onPatch({ protected: e.target.checked })} />
            <span>🔒 Защищённый контент (спойлер)</span>
          </label>

          {/* Delay */}
          <div style={s.delayRow}>
            <span style={s.delayLabel}>Задержка перед отправкой</span>
            <div style={s.delayInput}>
              <input
                type="number" min={0} max={300} step={1}
                value={msg.delay || 0}
                style={s.numInput}
                onChange={e => onPatch({ delay: Math.max(0, +e.target.value) })}
                onKeyDown={e => e.stopPropagation()}
              />
              <span style={s.delayUnit}>сек</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InpText({ value, placeholder, onChange, maxLength }) {
  return (
    <div style={s.inputGroup}>
      <input
        style={s.input}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.stopPropagation()}
      />
      <CharacterCounter value={value} maxLength={maxLength} />
    </div>
  );
}

function FileInput({ botId, type, accept, onFile }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    setError('');
    try {
      const uploaded = await uploadBotMedia(botId, type, file);
      onFile({ url: uploaded.url, fileName: uploaded.fileName, duration: uploaded.duration, size: uploaded.size });
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <label style={s.fileLabel}>
        {uploading ? 'Загрузка...' : '📁 Выбрать файл'}
        <input type="file" accept={accept} style={{ display: 'none' }} disabled={uploading} onChange={handleChange} />
      </label>
      {error && <div style={s.error}>{error}</div>}
    </>
  );
}

function fileAccept(type) {
  const map = { photo: 'image/*', video: 'video/*', voice: 'audio/*', audio: 'audio/*', document: '*' };
  return map[type] || '*';
}

function Section({ label, children }) {
  return (
    <div style={s.section}>
      <div style={s.sectionLabel}>{label}</div>
      {children}
    </div>
  );
}

const s = {
  section: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  empty: { color: '#4a5568', fontSize: 12, textAlign: 'center', padding: '8px 0' },
  addGrid: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  addBtn: {
    background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#a0aec0', fontSize: 12, padding: '5px 10px', cursor: 'pointer',
  },
  card: { background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  cardHead: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 10px', borderBottom: '1px solid #2d3458',
    background: '#252838',
  },
  collapseBtn: { background: 'transparent', border: 'none', color: '#718096', fontSize: 14, cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
  cardType: { fontSize: 12, fontWeight: 600, color: '#e2e8f0', flex: 1 },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 4 },
  delayBadge: { fontSize: 10, color: '#3b82f6', background: 'rgba(59,130,246,0.15)', borderRadius: 4, padding: '1px 5px' },
  moveBtn: { background: 'transparent', border: 'none', color: '#718096', fontSize: 13, cursor: 'pointer', padding: '0 3px', lineHeight: 1 },
  cardBody: { padding: '10px 10px' },
  typeGrid: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 },
  typeBtn: { border: 'none', borderRadius: 5, fontSize: 11, padding: '4px 8px', cursor: 'pointer' },
  textarea: {
    width: '100%', boxSizing: 'border-box',
    background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 13, padding: '7px 10px', outline: 'none',
    resize: 'vertical', marginBottom: 8, fontFamily: 'inherit',
  },
  input: {
    width: '100%', boxSizing: 'border-box', marginBottom: 6,
    background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none',
  },
  inputGroup: { width: '100%' },
  fileLabel: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#2a2d3e', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#a0aec0', fontSize: 12, padding: '5px 10px', cursor: 'pointer', marginBottom: 6,
  },
  fileName: { fontSize: 11, color: '#718096', marginTop: 2 },
  error: { fontSize: 11, color: '#fc8181', marginBottom: 4 },
  note: { fontSize: 11, color: '#718096', lineHeight: 1.45, margin: '3px 0 7px' },
  delayRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  protectedRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#a0aec0', cursor: 'pointer', marginBottom: 6, userSelect: 'none' },
  delayLabel: { fontSize: 12, color: '#718096' },
  delayInput: { display: 'flex', alignItems: 'center', gap: 4 },
  numInput: {
    width: 56, background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5,
    color: '#e2e8f0', fontSize: 13, padding: '4px 6px', outline: 'none', textAlign: 'center',
  },
  delayUnit: { fontSize: 12, color: '#718096' },
};
