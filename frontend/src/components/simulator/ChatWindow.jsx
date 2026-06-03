import React, { useEffect, useRef, useState } from 'react';

const ICONS = { text:'', photo:'🖼', video:'▶', voice:'🎤', audio:'🎵', document:'📄', notification:'🔔' };

export default function ChatWindow({ chatMsgs, status, delayInfo, onSend, onButtonClick, onSkipDelay, commands, onCommand, botName }) {
  const [input, setInput] = useState('');
  const [commandsOpen, setCommandsOpen] = useState(false);
  const messagesRef = useRef(null);
  const bottomRef = useRef(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    if (stickToBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs]);

  function send() {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  }

  return (
    <div style={s.wrap}>
      {/* TG Header */}
      <div style={s.header}>
        <div style={s.avatar}>🤖</div>
        <div>
          <div style={s.botName}>{botName || 'Test Bot'}</div>
          <div style={s.botStatus}>
            {status === 'running' ? 'печатает...' : status === 'waiting_input' ? 'ожидает ответа' : status === 'delay' ? 'пауза...' : 'бот'}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesRef}
        style={s.messages}
        onScroll={event => {
          const el = event.currentTarget;
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {chatMsgs.length === 0 && (
          <div style={s.empty}>Чат пустой. Запустите сценарий.</div>
        )}
        {chatMsgs.map(msg => (
          msg.from === 'user'
            ? <UserMsg key={msg.id} msg={msg} />
            : msg.type === 'keyboard'
              ? <InlineKeyboard key={msg.id} msg={msg} status={status} onButtonClick={onButtonClick} />
              : msg.type === 'purchase'
                ? <PurchaseCard key={msg.id} msg={msg} status={status} onButtonClick={onButtonClick} />
                : <BotMsg key={msg.id} msg={msg} />
        ))}

        {/* Delay indicator */}
        {delayInfo && (
          <div style={s.delayBanner}>
            <span>⏱ Задержка: {delayInfo.remaining} сек</span>
            <div style={s.delayBar}>
              <div style={{ ...s.delayFill, width: `${((delayInfo.total - delayInfo.remaining) / delayInfo.total) * 100}%` }} />
            </div>
            <button style={s.skipBtn} onClick={onSkipDelay}>Пропустить</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={s.inputRow}>
        <button type="button" style={s.commandToggle} title="Команды" onClick={() => setCommandsOpen(value => !value)}>☰</button>
        {commandsOpen && (
          <div style={s.commandMenu}>
            <div style={s.commandTitle}>Команды бота</div>
            {(commands || []).map(command => (
              <button
                type="button"
                key={command.label}
                style={s.commandButton}
                onClick={() => { setCommandsOpen(false); onCommand?.(command); }}
              >
                {command.label}
              </button>
            ))}
            {(commands || []).length === 0 && <div style={s.commandEmpty}>Команды не добавлены</div>}
          </div>
        )}
        <input
          style={s.inputField}
          value={input}
          placeholder={status === 'waiting_input' ? 'Введите ответ...' : 'Ждём бота...'}
          disabled={status !== 'waiting_input'}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); e.stopPropagation(); }}
        />
        <button style={{ ...s.sendBtn, opacity: status === 'waiting_input' && input.trim() ? 1 : 0.4 }}
          disabled={status !== 'waiting_input' || !input.trim()}
          onClick={send}>
          ➤
        </button>
      </div>
    </div>
  );
}

function BotMsg({ msg }) {
  const [revealed, setRevealed] = useState(false);
  if (msg.type === 'notification') {
    return <div style={s.notif}>🔔 {msg.text}</div>;
  }
  return (
    <div style={s.botBubbleWrap}>
      <div style={s.botAvatar}>🤖</div>
      <div style={s.botBubble}>
        <MsgContent msg={msg} revealed={revealed} onReveal={() => setRevealed(true)} />
        <div style={s.ts}>{new Date(msg.ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  );
}

function InlineKeyboard({ msg, status, onButtonClick }) {
  const [clicked, setClicked] = React.useState(null);
  return (
    <div style={s.botBubbleWrap}>
      <div style={s.botAvatar}>🤖</div>
      <div>
        {msg.title && <div style={s.kbTitle}>{msg.title}</div>}
        <div style={s.kbGrid}>
          {(msg.buttons || []).map(btn => (
            btn.type === 'url'
              ? <a key={btn.id} href={btn.url} target="_blank" rel="noreferrer"
                  style={{ ...s.kbBtn, textDecoration: 'none', color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {btn.label} <span style={{ fontSize: 10 }}>↗</span>
                </a>
              : <button key={btn.id}
                  style={{ ...s.kbBtn, background: clicked === btn.id ? '#2b5278' : '#17212b', opacity: clicked && clicked !== btn.id ? 0.5 : 1 }}
                  disabled={!!clicked || status !== 'waiting_input'}
                  onClick={() => { setClicked(btn.id); onButtonClick?.(btn.id, btn.label); }}>
                  {btn.label}
                </button>
          ))}
        </div>
        <div style={s.ts}>{new Date(msg.ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  );
}

function PurchaseCard({ msg, status, onButtonClick }) {
  const [clicked, setClicked] = React.useState(null);
  return (
    <div style={s.botBubbleWrap}>
      <div style={s.botAvatar}>🤖</div>
      <div style={s.purchaseCard}>
        <div style={s.purchaseIcon}>⭐</div>
        <div style={s.purchaseTitle}>Покупка Telegram Stars</div>
        <div style={s.purchaseKey}>{msg.productKey}</div>
        <div style={s.purchaseSub}>Это симуляция — реального списания не будет</div>
        <div style={s.kbGrid}>
          {(msg.buttons || []).map(btn => (
            <button key={btn.id}
              style={{ ...s.kbBtn, background: clicked === btn.id ? '#2b5278' : btn.id === 'pay' ? '#1a3a5c' : '#17212b', opacity: clicked && clicked !== btn.id ? 0.5 : 1 }}
              disabled={!!clicked || status !== 'waiting_input'}
              onClick={() => { setClicked(btn.id); onButtonClick?.(btn.id, btn.label); }}>
              {btn.label}
            </button>
          ))}
        </div>
        <div style={s.ts}>{new Date(msg.ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  );
}

function UserMsg({ msg }) {
  return (
    <div style={s.userBubbleWrap}>
      <div style={s.userBubble}>
        <span style={s.userText}>{msg.text}</span>
        <div style={{ ...s.ts, color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>
          {new Date(msg.ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })} ✓
        </div>
      </div>
    </div>
  );
}

function sanitizeTelegramHtml(text) {
  const raw = String(text || '');
  const tag = /<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler)\s*>|<a\s+href=(?:"[^"]*"|'[^']*')\s*>/gi;
  let cursor = 0;
  let html = '';
  let match;
  while ((match = tag.exec(raw))) {
    html += raw.slice(cursor, match.index).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html += match[0];
    cursor = match.index + match[0].length;
  }
  html += raw.slice(cursor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return html.replace(/<tg-spoiler>/gi, '<span class="tg-spoiler">').replace(/<\/tg-spoiler>/gi, '</span>');
}

function MsgContent({ msg, revealed, onReveal }) {
  const blurStyle = msg.protected && !revealed ? {
    filter: 'blur(10px)', cursor: 'pointer', userSelect: 'none',
  } : {};

  if (msg.type === 'text') {
    const hasFormatting = /<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler)\s*>|<a\s+href=/i.test(String(msg.text || ''));
    return (
      <div>
        {hasFormatting
          ? <span style={{ ...s.msgText, ...blurStyle }} onClick={msg.protected && !revealed ? onReveal : undefined} dangerouslySetInnerHTML={{ __html: sanitizeTelegramHtml(msg.text) }} />
          : <span style={{ ...s.msgText, ...blurStyle }} onClick={msg.protected && !revealed ? onReveal : undefined}>
              {msg.text || <em style={{ color: '#718096' }}>(пусто)</em>}
            </span>}
        {msg.protected && !revealed && <div style={s.spoilerHint}>👆 Нажмите для просмотра</div>}
      </div>
    );
  }

  if (msg.type === 'photo' && msg.url) {
    return (
      <div style={{ position: 'relative', cursor: msg.protected && !revealed ? 'pointer' : undefined }}
        onClick={msg.protected && !revealed ? onReveal : undefined}>
        <img src={msg.url} alt="photo" style={{ ...s.mediaImg, ...blurStyle }} />
        {msg.protected && !revealed && <div style={s.spoilerOverlay}>🔒 Спойлер<br /><small>Нажмите</small></div>}
      </div>
    );
  }

  if (msg.type === 'voice') {
    return (
      <div style={{ ...s.voiceWrap, ...blurStyle }} onClick={msg.protected && !revealed ? onReveal : undefined}>
        <span style={s.voicePlay}>▶</span>
        <div style={s.voiceWave}>{'▁▂▄▃▅▄▂▁▃▅▄▂▁'.split('').map((c, i) => (
          <span key={i} style={{ fontSize: 8, color: '#38bdf8', lineHeight: 1 }}>{c}</span>
        ))}</div>
        <span style={s.voiceDur}>0:05</span>
      </div>
    );
  }

  if (msg.type === 'audio') {
    return (
      <div style={{ ...s.audioWrap, ...blurStyle }} onClick={msg.protected && !revealed ? onReveal : undefined}>
        <span style={{ fontSize: 20 }}>🎵</span>
        <div style={{ flex: 1 }}>
          <div style={s.audioName}>{msg.fileName || 'Аудио'}</div>
          <div style={s.audioSub}>Музыкальный файл</div>
        </div>
      </div>
    );
  }

  if (msg.type === 'document') {
    return (
      <div style={{ ...s.docWrap, ...blurStyle }} onClick={msg.protected && !revealed ? onReveal : undefined}>
        <span style={{ fontSize: 22 }}>📄</span>
        <div style={{ flex: 1 }}>
          <div style={s.audioName}>{msg.fileName || msg.url?.split('/').pop() || 'Документ'}</div>
          <div style={s.audioSub}>Файл</div>
        </div>
      </div>
    );
  }

  if (msg.type === 'video') {
    return (
      <div style={{ ...s.videoWrap, ...(msg.asVideoNote ? s.videoNote : {}), ...blurStyle }} onClick={msg.protected && !revealed ? onReveal : undefined}>
        <span style={s.videoPaly}>▶</span>
        <span style={s.videoLabel}>{msg.fileName || 'Видео'}</span>
        {msg.protected && !revealed && <div style={s.spoilerOverlay}>🔒 Спойлер</div>}
      </div>
    );
  }

  return <span style={s.msgText}>{msg.text || `[${msg.type}]`}</span>;
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', background: '#0e1621', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.5)' },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#17212b', borderBottom: '1px solid #0e1621' },
  avatar: { width: 38, height: 38, borderRadius: '50%', background: '#2b5278', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 },
  botName: { fontSize: 15, fontWeight: 700, color: '#e2e8f0' },
  botStatus: { fontSize: 12, color: '#5ba4cf' },
  messages: { flex: 1, overflowY: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 6 },
  empty: { textAlign: 'center', color: '#4a5568', fontSize: 13, padding: '40px 0' },
  botBubbleWrap: { display: 'flex', gap: 8, alignItems: 'flex-end', maxWidth: '85%' },
  botAvatar: { width: 28, height: 28, borderRadius: '50%', background: '#2b5278', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'flex-end' },
  botBubble: { background: '#182533', borderRadius: '12px 12px 12px 2px', padding: '8px 12px', maxWidth: '100%', wordBreak: 'break-word' },
  userBubbleWrap: { display: 'flex', justifyContent: 'flex-end' },
  userBubble: { background: '#2b5278', borderRadius: '12px 12px 2px 12px', padding: '8px 12px', maxWidth: '80%', wordBreak: 'break-word' },
  userText: { fontSize: 14, color: '#e2e8f0' },
  msgText: { fontSize: 14, color: '#e2e8f0', display: 'block', whiteSpace: 'pre-wrap' },
  ts: { fontSize: 10, color: '#718096', marginTop: 3 },
  notif: { textAlign: 'center', fontSize: 12, color: '#718096', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '5px 12px', alignSelf: 'center' },
  spoilerHint: { fontSize: 11, color: '#3b82f6', marginTop: 4 },
  spoilerOverlay: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#e2e8f0', fontSize: 14, cursor: 'pointer', pointerEvents: 'none' },
  mediaImg: { maxWidth: 220, maxHeight: 180, borderRadius: 8, display: 'block' },
  voiceWrap: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' },
  voicePlay: { fontSize: 18, color: '#38bdf8', cursor: 'pointer' },
  voiceWave: { display: 'flex', alignItems: 'flex-end', gap: 2, height: 24 },
  voiceDur: { fontSize: 12, color: '#718096' },
  audioWrap: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', minWidth: 180 },
  audioName: { fontSize: 13, color: '#e2e8f0', fontWeight: 600 },
  audioSub: { fontSize: 11, color: '#718096' },
  docWrap: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', minWidth: 180 },
  videoWrap: { position: 'relative', width: 200, height: 130, background: '#0e1621', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4 },
  videoNote: { width: 150, height: 150, borderRadius: '50%' },
  videoPaly: { fontSize: 32, color: '#38bdf8' },
  videoLabel: { fontSize: 12, color: '#718096' },
  delayBanner: { background: 'rgba(246,173,85,0.12)', border: '1px solid rgba(246,173,85,0.3)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#f6ad55' },
  delayBar: { flex: 1, height: 4, background: 'rgba(246,173,85,0.2)', borderRadius: 2, overflow: 'hidden' },
  delayFill: { height: '100%', background: '#f6ad55', borderRadius: 2, transition: 'width 1s linear' },
  skipBtn: { background: 'transparent', border: '1px solid rgba(246,173,85,0.4)', borderRadius: 5, color: '#f6ad55', fontSize: 11, padding: '3px 8px', cursor: 'pointer' },
  inputRow: { position: 'relative', display: 'flex', gap: 8, padding: '10px 12px', background: '#17212b', borderTop: '1px solid #0e1621' },
  commandToggle: { width: 38, height: 38, flexShrink: 0, border: 'none', borderRadius: '50%', background: '#242f3d', color: '#5ba4cf', fontSize: 18, cursor: 'pointer' },
  commandMenu: { position: 'absolute', left: 12, bottom: 56, zIndex: 5, minWidth: 190, maxHeight: 250, overflowY: 'auto', background: '#17212b', border: '1px solid #2b5278', borderRadius: 9, padding: 6, boxShadow: '0 8px 22px rgba(0,0,0,0.5)' },
  commandTitle: { color: '#718096', fontSize: 11, padding: '4px 7px 6px', textTransform: 'uppercase', letterSpacing: 0.6 },
  commandButton: { display: 'block', width: '100%', background: 'transparent', border: 'none', borderRadius: 5, color: '#38bdf8', padding: '7px 8px', textAlign: 'left', fontSize: 13, cursor: 'pointer' },
  commandEmpty: { color: '#718096', fontSize: 12, padding: '7px 8px' },
  inputField: { flex: 1, background: '#242f3d', border: 'none', borderRadius: 20, color: '#e2e8f0', fontSize: 14, padding: '8px 14px', outline: 'none' },
  sendBtn: { background: '#2b5278', border: 'none', borderRadius: '50%', width: 38, height: 38, color: '#fff', fontSize: 16, cursor: 'pointer', flexShrink: 0 },
  kbTitle: { fontSize: 13, color: '#e2e8f0', marginBottom: 6 },
  kbGrid:  { display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 280 },
  kbBtn:   { border: '1px solid #2b5278', borderRadius: 8, color: '#38bdf8', fontSize: 13, padding: '8px 14px', cursor: 'pointer', transition: 'background 0.15s' },
  purchaseCard: { background: '#1a2535', border: '1px solid #2b5278', borderRadius: 12, padding: '12px 14px', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 6 },
  purchaseIcon: { fontSize: 28, textAlign: 'center' },
  purchaseTitle: { color: '#e2e8f0', fontWeight: 700, fontSize: 14, textAlign: 'center' },
  purchaseKey: { color: '#38bdf8', fontSize: 12, textAlign: 'center', background: 'rgba(56,189,248,0.1)', borderRadius: 4, padding: '2px 6px' },
  purchaseSub: { color: '#718096', fontSize: 11, textAlign: 'center' },
};
