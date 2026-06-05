/**
 * Codex developer notes:
 * Панель интерфейса TelegramBackupModal: отдельная рабочая область редактора или админского инструмента.
 * Панель держит локальные UI-состояния, но долгоживущие данные получает через props или API-клиент.
 * Изменения здесь часто влияют на UX, поэтому проверяй переполнение текста и поведение на узких экранах.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React, { useEffect, useState } from 'react';
import {
  getTelegramBackupSettings,
  restoreTelegramBackup,
  saveTelegramBackupSettings,
  sendTelegramBackupNow,
} from '../../api';

const EMPTY_SETTINGS = {
  enabled: false,
  token: '',
  chatId: '',
  scheduleTime: '03:00',
  lastSentAt: null,
  lastError: '',
};

export default function TelegramBackupModal({ onClose }) {
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getTelegramBackupSettings()
      .then(data => { if (active) setSettings({ ...EMPTY_SETTINGS, ...data }); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  function patch(update) {
    setSettings(current => ({ ...current, ...update }));
    setStatus('');
    setError('');
  }

  async function run(action) {
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const result = await action();
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    const result = await run(() => saveTelegramBackupSettings(settings));
    if (result) {
      setSettings({ ...EMPTY_SETTINGS, ...result });
      setStatus('Настройки сохранены.');
    }
  }

  async function handleSendNow() {
    const saved = await run(() => saveTelegramBackupSettings(settings));
    if (!saved) return;
    setSettings({ ...EMPTY_SETTINGS, ...saved });
    const result = await run(sendTelegramBackupNow);
    if (result) setStatus(`Бэкап отправлен: ${result.fileName}, ${formatBytes(result.size)}.`);
  }

  async function handleRestore() {
    if (!file) {
      setError('Выберите архив бэкапа.');
      return;
    }
    if (!confirm('Восстановить боты, медиа и базу данных из архива? Текущие файлы и данные игроков будут заменены.')) return;
    const result = await run(() => restoreTelegramBackup(file));
    if (result) setStatus(`Восстановлено файлов: ${result.files}. БД: ${result.databaseRestored ? 'восстановлена' : 'нет в архиве'}. Обновите список ботов.`);
  }

  return (
    <div style={s.overlay} onMouseDown={() => !busy && onClose()}>
      <div style={s.modal} onMouseDown={event => event.stopPropagation()}>
        <div style={s.header}>
          <div>
            <div style={s.eyebrow}>SNR93</div>
            <h2 style={s.title}>Telegram бэкап</h2>
          </div>
          <button style={s.close} onClick={onClose} disabled={busy}>×</button>
        </div>

        <form style={s.form} onSubmit={handleSave}>
          <label style={s.label}>
            Telegram-токен бота для бэкапов
            <input
              style={s.input}
              value={settings.token}
              onChange={event => patch({ token: event.target.value })}
              placeholder="123456:ABC..."
              autoComplete="off"
            />
          </label>

          <label style={s.label}>
            Telegram chat ID получателя
            <input
              style={s.input}
              value={settings.chatId}
              onChange={event => patch({ chatId: event.target.value })}
              placeholder="123456789"
              autoComplete="off"
            />
          </label>

          <div style={s.row}>
            <label style={s.labelGrow}>
              Время отправки по МСК
              <input
                style={s.input}
                type="time"
                value={settings.scheduleTime}
                onChange={event => patch({ scheduleTime: event.target.value })}
              />
            </label>
            <label style={s.toggle}>
              <input
                type="checkbox"
                checked={!!settings.enabled}
                onChange={event => patch({ enabled: event.target.checked })}
              />
              По расписанию
            </label>
          </div>

          <div style={s.actions}>
            <button type="submit" style={s.secondary} disabled={busy}>Сохранить</button>
            <button type="button" style={s.primary} onClick={handleSendNow} disabled={busy}>
              {busy ? 'Выполняется...' : 'Отправить бэкап'}
            </button>
          </div>
        </form>

        <div style={s.restore}>
          <div style={s.restoreTitle}>Восстановление из бэкапа</div>
          <div style={s.restoreHint}>Новый архив содержит боты, медиа и дамп PostgreSQL. Старые архивы без дампа восстановят только файлы.</div>
          <input
            style={s.file}
            type="file"
            accept=".gz,.tgz,.tar.gz,application/gzip,application/x-gzip"
            onChange={event => setFile(event.target.files?.[0] || null)}
            disabled={busy}
          />
          <button style={s.danger} onClick={handleRestore} disabled={busy || !file}>Восстановить из архива</button>
        </div>

        {(settings.lastSentAt || settings.lastError) && (
          <div style={s.meta}>
            {settings.lastSentAt && <div>Последняя отправка: {formatDate(settings.lastSentAt)}</div>}
            {settings.lastError && <div style={s.errorText}>Последняя ошибка: {settings.lastError}</div>}
          </div>
        )}

        {status && <div style={s.status}>{status}</div>}
        {error && <div style={s.error}>{error}</div>}
      </div>
    </div>
  );
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(7,10,18,0.78)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
  },
  modal: {
    width: 'min(680px, 100%)', maxHeight: '90vh', overflow: 'auto',
    background: '#171923', border: '1px solid #2d3458', borderRadius: 8,
    boxShadow: '0 20px 60px rgba(0,0,0,0.55)', padding: 18, color: '#e2e8f0',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  eyebrow: { color: '#63b3ed', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0 },
  title: { margin: '3px 0 0', fontSize: 22, lineHeight: 1.2 },
  close: { background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 28, cursor: 'pointer', lineHeight: 1 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, color: '#a0aec0', fontSize: 12, fontWeight: 700 },
  labelGrow: { display: 'flex', flexDirection: 'column', gap: 6, color: '#a0aec0', fontSize: 12, fontWeight: 700, flex: 1 },
  input: {
    background: '#0f172a', border: '1px solid #2d3458', color: '#e2e8f0',
    borderRadius: 6, padding: '9px 10px', fontSize: 14, outline: 'none',
  },
  row: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' },
  toggle: {
    minHeight: 38, display: 'flex', alignItems: 'center', gap: 8,
    color: '#cbd5e1', fontSize: 13, border: '1px solid #2d3458',
    borderRadius: 6, padding: '0 10px', background: '#111827',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  primary: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 13px', fontWeight: 800, cursor: 'pointer' },
  secondary: { background: '#1e2030', color: '#cbd5e1', border: '1px solid #2d3458', borderRadius: 6, padding: '9px 13px', fontWeight: 700, cursor: 'pointer' },
  restore: { marginTop: 18, paddingTop: 16, borderTop: '1px solid #2d3458', display: 'flex', flexDirection: 'column', gap: 10 },
  restoreTitle: { fontSize: 13, color: '#fbd38d', fontWeight: 800 },
  restoreHint: { color: '#94a3b8', fontSize: 12, lineHeight: 1.45 },
  file: { color: '#cbd5e1', fontSize: 13 },
  danger: { alignSelf: 'flex-start', background: '#7f1d1d', color: '#fff', border: '1px solid #b91c1c', borderRadius: 6, padding: '9px 13px', fontWeight: 800, cursor: 'pointer' },
  meta: { marginTop: 14, color: '#94a3b8', fontSize: 12, display: 'grid', gap: 5 },
  status: { marginTop: 12, color: '#86efac', fontSize: 13 },
  error: { marginTop: 12, color: '#fecaca', background: 'rgba(127,29,29,0.35)', border: '1px solid #7f1d1d', borderRadius: 6, padding: 10, fontSize: 13 },
  errorText: { color: '#fca5a5' },
};
