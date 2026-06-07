import React from 'react';

// Renders Telegram-formatted text (MarkdownV2 and HTML modes) for node previews.
export default function TelegramText({ text, style }) {
  if (!text) return null;
  let k = 0;
  const nodes = parse(text, () => ++k);
  return <span style={style}>{nodes}</span>;
}

function parse(text, key) {
  if (!text) return [];

  const patterns = [
    // HTML tags — checked before Markdown to avoid false positives
    { re: /<b>([\s\S]*?)<\/b>/i,           wrap: (c) => <strong key={key()} style={F.b}>{parse(c, key)}</strong> },
    { re: /<strong>([\s\S]*?)<\/strong>/i,  wrap: (c) => <strong key={key()} style={F.b}>{parse(c, key)}</strong> },
    { re: /<i>([\s\S]*?)<\/i>/i,            wrap: (c) => <em key={key()} style={F.i}>{parse(c, key)}</em> },
    { re: /<em>([\s\S]*?)<\/em>/i,          wrap: (c) => <em key={key()} style={F.i}>{parse(c, key)}</em> },
    { re: /<u>([\s\S]*?)<\/u>/i,            wrap: (c) => <span key={key()} style={F.u}>{parse(c, key)}</span> },
    { re: /<ins>([\s\S]*?)<\/ins>/i,        wrap: (c) => <span key={key()} style={F.u}>{parse(c, key)}</span> },
    { re: /<s>([\s\S]*?)<\/s>/i,            wrap: (c) => <span key={key()} style={F.s}>{parse(c, key)}</span> },
    { re: /<strike>([\s\S]*?)<\/strike>/i,  wrap: (c) => <span key={key()} style={F.s}>{parse(c, key)}</span> },
    { re: /<del>([\s\S]*?)<\/del>/i,        wrap: (c) => <span key={key()} style={F.s}>{parse(c, key)}</span> },
    { re: /<code>([\s\S]*?)<\/code>/i,      wrap: (c) => <code key={key()} style={F.code}>{c}</code> },
    { re: /<pre>([\s\S]*?)<\/pre>/i,        wrap: (c) => <code key={key()} style={F.code}>{c}</code> },
    { re: /<tg-spoiler>([\s\S]*?)<\/tg-spoiler>/i, wrap: (c) => <span key={key()} style={F.spoiler} title="Спойлер">{parse(c, key)}</span> },
    { re: /<a href="[^"]*">([\s\S]*?)<\/a>/i, wrap: (c) => <span key={key()} style={F.link}>{parse(c, key)}</span> },
    // MarkdownV2
    { re: /\*\*([\s\S]*?)\*\*/,  wrap: (c) => <strong key={key()} style={F.b}>{parse(c, key)}</strong> },
    { re: /\*([\s\S]*?)\*/,      wrap: (c) => <strong key={key()} style={F.b}>{parse(c, key)}</strong> },
    { re: /__([\s\S]*?)__/,      wrap: (c) => <span key={key()} style={F.u}>{parse(c, key)}</span> },
    { re: /_([\s\S]*?)_/,        wrap: (c) => <em key={key()} style={F.i}>{parse(c, key)}</em> },
    { re: /~~([\s\S]*?)~~/,      wrap: (c) => <span key={key()} style={F.s}>{parse(c, key)}</span> },
    { re: /~([\s\S]*?)~/,        wrap: (c) => <span key={key()} style={F.s}>{parse(c, key)}</span> },
    { re: /\|\|([\s\S]*?)\|\|/,  wrap: (c) => <span key={key()} style={F.spoiler} title="Спойлер">{parse(c, key)}</span> },
    { re: /```([\s\S]*?)```/,    wrap: (c) => <code key={key()} style={F.code}>{c}</code> },
    { re: /`([\s\S]*?)`/,        wrap: (c) => <code key={key()} style={F.code}>{c}</code> },
    { re: /\[([^\]]+)\]\([^)]+\)/, wrap: (c) => <span key={key()} style={F.link}>{parse(c, key)}</span> },
  ];

  // Find the earliest match across all patterns
  let best = null;
  for (const pat of patterns) {
    const m = pat.re.exec(text);
    if (m && (best === null || m.index < best.index)) {
      best = { index: m.index, full: m[0], inner: m[1], wrap: pat.wrap };
    }
  }

  if (!best) return [text];

  const result = [];
  if (best.index > 0) result.push(text.slice(0, best.index));
  result.push(best.wrap(best.inner));
  result.push(...parse(text.slice(best.index + best.full.length), key));
  return result;
}

const F = {
  b:       { fontWeight: 700, color: '#e2e8f0' },
  i:       { fontStyle: 'italic' },
  u:       { textDecoration: 'underline' },
  s:       { textDecoration: 'line-through', opacity: 0.7 },
  code:    { fontFamily: 'monospace', background: 'rgba(255,255,255,0.09)', borderRadius: 3, padding: '0 3px', fontSize: '0.92em' },
  spoiler: { background: '#718096', color: '#718096', borderRadius: 3, cursor: 'default' },
  link:    { color: '#38bdf8', textDecoration: 'underline' },
};
