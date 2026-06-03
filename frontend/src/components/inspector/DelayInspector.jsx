import React from 'react';

export default function DelayInspector({ data, onUpdate }) {
  const amount = data.amount ?? data.seconds ?? 3;
  const unit = data.unit || 'seconds';
  return (
    <div>
      <Section label="Задержка">
        <div style={s.row}>
          <input type="number" min={0} step={1} value={amount}
            style={s.big} onChange={e => onUpdate({ amount: Math.max(0, +e.target.value), unit })}
            onKeyDown={e => e.stopPropagation()} />
          <select style={s.select} value={unit} onChange={e => onUpdate({ amount, unit: e.target.value })}>
            <option value="seconds">секунд</option>
            <option value="minutes">минут</option>
            <option value="hours">часов</option>
            <option value="days">дней</option>
          </select>
        </div>
        <div style={s.hint}>Бот подождёт указанное время, затем перейдёт к следующему блоку.</div>
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
  row: { display: 'flex', alignItems: 'center', gap: 10 },
  big: { width: 90, background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#f6ad55', fontSize: 28, fontWeight: 700, padding: '6px 12px', outline: 'none', textAlign: 'center' },
  unit: { fontSize: 16, color: '#718096' },
  select: { background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#a0aec0', fontSize: 14, padding: '8px', outline: 'none' },
  hint: { fontSize: 12, color: '#4a5568', marginTop: 10, lineHeight: 1.5 },
};
