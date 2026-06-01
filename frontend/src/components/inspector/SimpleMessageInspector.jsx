import React, { useState } from 'react';
import { uploadBotMedia } from '../../api';
import PlaceholderField from './PlaceholderField';
import CountedInput from './CountedInput';
import { EDITOR_LIMITS, TELEGRAM_LIMITS, mediaRuleText, validateVideoNoteDuration } from '../../telegramLimits';

const TYPES = [
  { key: 'text',     icon: '✎',  label: 'Текст'      },
  { key: 'photo',    icon: '🖼', label: 'Фото'       },
  { key: 'video',    icon: '▶',  label: 'Видео'      },
  { key: 'voice',    icon: '🎤', label: 'Голосовое'  },
  { key: 'audio',    icon: '🎵', label: 'Аудио'      },
  { key: 'document', icon: '📄', label: 'Документ'   },
];

const FILE_ACCEPT = { photo: 'image/*', video: 'video/*', voice: 'audio/*', audio: 'audio/*', document: '*' };

export default function SimpleMessageInspector({ data, onUpdate, botId }) {
  const type = data.type || 'text';
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const uploaded = await uploadBotMedia(botId, type, file);
      onUpdate({ url: uploaded.url, fileName: uploaded.fileName, duration: uploaded.duration, size: uploaded.size });
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <Section label="Тип сообщения">
        <div style={s.typeGrid}>
          {TYPES.map(t => (
            <button key={t.key}
              style={{ ...s.typeBtn, background: type === t.key ? '#3b82f6' : '#2a2d3e', color: type === t.key ? '#fff' : '#a0aec0', borderColor: type === t.key ? '#3b82f6' : '#3a3f55' }}
              onClick={() => onUpdate({ type: t.key })}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Содержимое">
        {type === 'text' ? (
          <PlaceholderField as="textarea" style={s.textarea} value={data.text || ''} placeholder="Текст сообщения..." rows={4}
            maxLength={TELEGRAM_LIMITS.messageText}
            onChange={e => onUpdate({ text: e.target.value })}
            onKeyDown={e => e.stopPropagation()} />
        ) : (
          <>
            <CountedInput style={s.input} value={data.url || ''} maxLength={EDITOR_LIMITS.url} placeholder="URL файла..."
              onChange={e => onUpdate({ url: e.target.value })}
            />
            <label style={s.fileBtn}>
              {uploading ? 'Загрузка...' : '📁 Выбрать файл'}
              <input type="file" accept={FILE_ACCEPT[type] || '*'} style={{ display: 'none' }}
                disabled={uploading}
                onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {uploadError && <div style={s.error}>{uploadError}</div>}
            {data.fileName && <div style={s.fname}>📎 {data.fileName}</div>}
            <div style={s.note}>{mediaRuleText(type, data.asVideoNote)}</div>
          </>
        )}
      </Section>

      <Section label="Дополнительно">
        {type === 'video' && (
          <label style={s.toggle}>
            <input type="checkbox" checked={!!data.asVideoNote} onChange={e => {
              const error = e.target.checked ? validateVideoNoteDuration(data.duration) : '';
              if (error) return setUploadError(error);
              setUploadError('');
              onUpdate({ asVideoNote: e.target.checked });
            }} />
            <span>Отправить видео как кружок</span>
          </label>
        )}
        <label style={s.toggle}>
          <input type="checkbox" checked={!!data.protected} onChange={e => onUpdate({ protected: e.target.checked })} />
          <span>🔒 Защищённый контент (спойлер) — скрыт до нажатия</span>
        </label>
      </Section>
    </div>
  );
}
function Section({ label, children }) {
  return <div style={s.section}><div style={s.sLabel}>{label}</div>{children}</div>;
}
const s = {
  section: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  sLabel: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  typeGrid: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  typeBtn: { border: '1px solid', borderRadius: 6, fontSize: 12, padding: '5px 10px', cursor: 'pointer' },
  textarea: { width: '100%', boxSizing: 'border-box', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 13, padding: '7px 10px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
  input: { width: '100%', boxSizing: 'border-box', marginBottom: 6, background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none' },
  fileBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2a2d3e', border: '1px solid #3a3f55', borderRadius: 6, color: '#a0aec0', fontSize: 12, padding: '5px 10px', cursor: 'pointer', marginBottom: 4 },
  fname: { fontSize: 11, color: '#718096', marginTop: 4 },
  error: { fontSize: 11, color: '#fc8181', marginTop: 4 },
  note: { fontSize: 11, color: '#718096', lineHeight: 1.45, marginTop: 5 },
  toggle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#a0aec0', cursor: 'pointer', userSelect: 'none' },
};
