import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { uploadBotMedia } from '../../api';
import { EDITOR_LIMITS, mediaRuleText, validateVideoNoteDuration } from '../../telegramLimits';
import CharacterCounter from './CharacterCounter';

const TYPES = [
  { key: 'photo', icon: '🖼', label: 'Фото' },
  { key: 'video', icon: '▶', label: 'Видео' },
  { key: 'audio', icon: '🎤', label: 'Аудио' },
  { key: 'document', icon: '📄', label: 'Документ' },
];

function makeMedia(type = 'photo') {
  return { id: uuidv4(), type, url: '', fileName: '', delay: 0, protected: false, asVideoNote: false };
}

function detectType(file) {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

export default function MediaInspector({ data, onUpdate, botId }) {
  const items = data.items || [];
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  function updateItems(nextItems) {
    onUpdate({ items: nextItems });
  }

  function patchItem(id, patch) {
    updateItems(items.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function moveItem(id, direction) {
    const nextItems = [...items];
    const index = nextItems.findIndex(item => item.id === id);
    if (direction === 'up' && index > 0) [nextItems[index - 1], nextItems[index]] = [nextItems[index], nextItems[index - 1]];
    if (direction === 'down' && index < nextItems.length - 1) [nextItems[index + 1], nextItems[index]] = [nextItems[index], nextItems[index + 1]];
    updateItems(nextItems);
  }

  async function uploadFiles(files) {
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const uploadedItems = [];
      for (const file of files) {
        const type = detectType(file);
        const uploaded = await uploadBotMedia(botId, type, file);
        uploadedItems.push({ ...makeMedia(type), url: uploaded.url, fileName: uploaded.fileName, duration: uploaded.duration, size: uploaded.size });
      }
      updateItems([...items, ...uploadedItems]);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <Section label="Название блока">
        <Input value={data.title || ''} maxLength={EDITOR_LIMITS.title} placeholder="Медиа" onChange={value => onUpdate({ title: value })} />
        <label style={s.checkRow}>
          <input type="checkbox" checked={!!data.asAlbum} onChange={event => onUpdate({ asAlbum: event.target.checked })} />
          <span>Отправить фото и видео одним альбомом</span>
        </label>
        {data.asAlbum && <div style={s.note}>Альбом применяется для 2-10 фото или видео. Для остальных файлов сохраняется последовательная отправка с задержками.</div>}
      </Section>

      <Section label={`Медиа (${items.length})`}>
        {items.length === 0 && <div style={s.empty}>Добавьте один или несколько файлов.</div>}
        {items.map((item, index) => (
          <MediaCard
            key={item.id}
            item={item}
            index={index}
            total={items.length}
            botId={botId}
            onPatch={patch => patchItem(item.id, patch)}
            onDelete={() => updateItems(items.filter(entry => entry.id !== item.id))}
            onMove={direction => moveItem(item.id, direction)}
          />
        ))}
      </Section>

      <Section label="Добавить медиа">
        <label style={s.uploadButton}>
          {uploading ? 'Загрузка...' : '📁 Выбрать один или несколько файлов'}
          <input
            type="file"
            multiple
            style={{ display: 'none' }}
            disabled={uploading}
            onChange={event => {
              uploadFiles([...event.target.files]);
              event.target.value = '';
            }}
          />
        </label>
        <div style={s.addGrid}>
          {TYPES.map(type => (
            <button key={type.key} style={s.addButton} onClick={() => updateItems([...items, makeMedia(type.key)])}>
              {type.icon} URL {type.label.toLowerCase()}
            </button>
          ))}
        </div>
        {error && <div style={s.error}>{error}</div>}
      </Section>
    </div>
  );
}

function MediaCard({ item, index, total, botId, onPatch, onDelete, onMove }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const type = detectType(file);
      const uploaded = await uploadBotMedia(botId, type, file);
      onPatch({ type, url: uploaded.url, fileName: uploaded.fileName, duration: uploaded.duration, size: uploaded.size });
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>{TYPES.find(type => type.key === item.type)?.icon || '📎'} {item.fileName || item.type}</span>
        {item.delay > 0 && <span style={s.delayBadge}>{item.delay}с</span>}
        <button style={s.smallButton} onClick={() => onMove('up')} disabled={index === 0}>↑</button>
        <button style={s.smallButton} onClick={() => onMove('down')} disabled={index === total - 1}>↓</button>
        <button style={{ ...s.smallButton, color: '#fc8181' }} onClick={onDelete}>✕</button>
      </div>
      <div style={s.cardBody}>
        <div style={s.typeGrid}>
          {TYPES.map(type => (
            <button key={type.key}
              style={{ ...s.typeButton, background: item.type === type.key ? '#3b82f6' : '#2a2d3e', color: item.type === type.key ? '#fff' : '#a0aec0' }}
              onClick={() => onPatch({ type: type.key })}>
              {type.icon} {type.label}
            </button>
          ))}
        </div>
        <Input value={item.url || ''} maxLength={EDITOR_LIMITS.url} placeholder="URL файла..." onChange={url => onPatch({ url })} />
        <label style={s.fileButton}>
          {uploading ? 'Загрузка...' : '📁 Заменить файл'}
          <input type="file" style={{ display: 'none' }} disabled={uploading}
            onChange={event => { uploadFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {error && <div style={s.error}>{error}</div>}
        <div style={s.note}>{mediaRuleText(item.type, item.asVideoNote)}</div>

        {item.type === 'video' && (
          <label style={s.checkRow}>
            <input type="checkbox" checked={!!item.asVideoNote} onChange={event => {
              const durationError = event.target.checked ? validateVideoNoteDuration(item.duration) : '';
              if (durationError) return setError(durationError);
              setError('');
              onPatch({ asVideoNote: event.target.checked });
            }} />
            <span>Отправить видео как кружок</span>
          </label>
        )}
        <label style={s.checkRow}>
          <input type="checkbox" checked={!!item.protected} onChange={event => onPatch({ protected: event.target.checked })} />
          <span>🔒 Защищённый контент</span>
        </label>
        <div style={s.delayRow}>
          <span style={s.delayLabel}>Задержка перед отправкой</span>
          <input type="number" min={0} max={300} step={1} value={item.delay || 0} style={s.numberInput}
            onChange={event => onPatch({ delay: Math.max(0, +event.target.value) })}
            onKeyDown={event => event.stopPropagation()} />
          <span style={s.delayLabel}>сек</span>
        </div>
      </div>
    </div>
  );
}

function Input({ value, placeholder, onChange, maxLength }) {
  return <div style={s.inputGroup}>
    <input style={s.input} value={value} maxLength={maxLength} placeholder={placeholder}
      onChange={event => onChange(event.target.value)} onKeyDown={event => event.stopPropagation()} />
    <CharacterCounter value={value} maxLength={maxLength} />
  </div>;
}

function Section({ label, children }) {
  return <div style={s.section}><div style={s.sectionLabel}>{label}</div>{children}</div>;
}

const s = {
  section: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  empty: { color: '#4a5568', fontSize: 12, textAlign: 'center', padding: '8px 0' },
  uploadButton: { display: 'block', background: '#2563eb', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, padding: '8px 10px', cursor: 'pointer', textAlign: 'center', marginBottom: 8 },
  addGrid: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  addButton: { background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 6, color: '#a0aec0', fontSize: 11, padding: '5px 8px', cursor: 'pointer' },
  card: { background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 4, padding: '7px 9px', background: '#252838', borderBottom: '1px solid #2d3458' },
  cardTitle: { flex: 1, color: '#e2e8f0', fontSize: 12, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap' },
  cardBody: { padding: 9 },
  delayBadge: { fontSize: 10, color: '#3b82f6', background: 'rgba(59,130,246,0.15)', borderRadius: 4, padding: '1px 5px' },
  smallButton: { background: 'transparent', border: 'none', color: '#718096', fontSize: 13, cursor: 'pointer', padding: '0 3px' },
  typeGrid: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  typeButton: { border: 'none', borderRadius: 5, fontSize: 11, padding: '4px 7px', cursor: 'pointer' },
  input: { width: '100%', boxSizing: 'border-box', marginBottom: 6, background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none' },
  inputGroup: { width: '100%' },
  fileButton: { display: 'inline-flex', background: '#2a2d3e', border: '1px solid #3a3f55', borderRadius: 6, color: '#a0aec0', fontSize: 12, padding: '5px 9px', cursor: 'pointer', marginBottom: 7 },
  checkRow: { display: 'flex', alignItems: 'center', gap: 7, color: '#a0aec0', fontSize: 12, cursor: 'pointer', marginBottom: 6 },
  delayRow: { display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 },
  delayLabel: { color: '#718096', fontSize: 12 },
  numberInput: { width: 48, marginLeft: 'auto', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', fontSize: 13, padding: '4px 6px', textAlign: 'center', outline: 'none' },
  error: { color: '#fc8181', fontSize: 11, marginTop: 5 },
  note: { color: '#718096', fontSize: 11, lineHeight: 1.5, marginTop: 5 },
};
