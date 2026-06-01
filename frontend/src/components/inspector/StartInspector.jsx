import React from 'react';

export default function StartInspector({ data, onUpdate }) {
  return (
    <div>
      <Section label="Стартовый блок">
        <div style={s.info}>
          Это начало основной истории. Если добавлено глобальное меню, команда /start сначала открывает меню,
          а в сюжет игрок попадает через ноду «Продолжить историю».
        </div>
      </Section>
    </div>
  );
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
  info: { fontSize: 12, color: '#718096', lineHeight: 1.6 },
};
