import React, { useMemo, useState } from 'react';
import { DOCUMENTED_NODES, NODE_CATEGORIES } from '../nodes/nodeCatalog';
import { SYSTEM_PLACEHOLDERS } from '../../telegramLimits';

const SECTIONS = [
  {
    id: 'start',
    title: 'Быстрый старт',
    content: (
      <>
        <p>Сценарий начинается с ноды «Начало истории». Соедините её с первой игровой нодой, добавьте сообщения и выбор игрока, затем нажмите «Тест».</p>
        <Guide steps={[
          'Добавляйте ноды из панели слева или через ПКМ по рабочей зоне.',
          'Тяните связь от точки выхода к нужной ноде. Двойной клик по стрелке разрывает связь.',
          'Нажмите play на отдельной ноде для точечной проверки сценария с этого места.',
          'Перед запуском Telegram-бота используйте проверку сценария на ошибки.',
        ]} />
      </>
    ),
  },
  {
    id: 'variables',
    title: 'Переменные и плейсхолдеры',
    content: (
      <>
        <p>Переменная появляется в ветке только после выполнения соответствующей ноды. Boolean-переменные до первого изменения считаются равными <code>false</code>, числовые — <code>0</code>.</p>
        <p>В тексте используйте плейсхолдеры вида <code>{'{{Монеты}}'}</code>. После ввода <code>{'{{'}</code> откроется список всех переменных проекта, даже если они находятся в другой ветке. Валидный плейсхолдер подсвечивается зелёным, неизвестный — красным.</p>
        <SystemPlaceholderList />
        <Note>Список подсказок показывает все переменные проекта. При этом фактическое значение пользовательской переменной появится у игрока только после выполнения соответствующей ноды.</Note>
      </>
    ),
  },
  {
    id: 'canvas',
    title: 'Рабочая зона',
    content: (
      <>
        <Guide steps={[
          'Зажмите Ctrl и протяните рамку, чтобы выделить несколько нод.',
          'Выделенные ноды можно перемещать и удалять одновременно.',
          'Нажмите «Группа», чтобы поместить выделенные ноды в цветную рамку.',
          'Ноды автоматически прикрепляются к группе при переносе внутрь и отделяются при переносе наружу.',
          'Комментарий можно прикрепить второй связью: он не влияет на выполнение сценария.',
        ]} />
      </>
    ),
  },
  {
    id: 'telegram',
    title: 'Telegram и тестирование',
    content: (
      <>
        <p>Кнопка «Тест» запускает встроенный симулятор. В нём доступны переменные, журнал выполнения и меню команд <code>☰</code>.</p>
        <p>Для запуска настоящего бота нажмите «Создать Telegram-бота», вставьте токен от <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> и подтвердите запуск. Сценарий автоматически сохраняется перед стартом.</p>
        <Note>Глобальное меню, настройки и пользовательские команды выполняются независимо от основной ветки истории.</Note>
      </>
    ),
  },
  {
    id: 'nodes',
    title: 'Каталог нод',
    content: <NodeCatalog />,
  },
  {
    id: 'admin',
    title: 'Администрирование',
    content: (
      <>
        <p>Кнопка «Админ» открывает данные игроков, инвентарь, отношения, достижения, промокоды, товары, версии сценария, резервные копии, очередь задач и аналитику.</p>
        <Note>Перед крупным изменением сценария создавайте резервную копию и новую версию. Это позволяет выпускать обновления без сброса прогресса игроков.</Note>
      </>
    ),
  },
];

export default function HelpModal({ onClose }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return SECTIONS;
    return SECTIONS.filter(section => sectionText(section).toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery]);
  const section = filteredSections.find(item => item.id === active) || filteredSections[0] || SECTIONS[0];
  return (
    <div style={s.overlay} onMouseDown={onClose}>
      <div style={s.modal} onMouseDown={event => event.stopPropagation()}>
        <div style={s.header}>
          <div>
            <div style={s.eyebrow}>Конструктор Telegram-игр</div>
            <div style={s.heading}>Справка</div>
          </div>
          <button type="button" style={s.close} onClick={onClose}>×</button>
        </div>
        <div style={s.searchWrap}>
          <input
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              const next = SECTIONS.find(section => sectionText(section).toLowerCase().includes(event.target.value.trim().toLowerCase()));
              if (next) setActive(next.id);
            }}
            onKeyDown={event => event.stopPropagation()}
            style={s.search}
            placeholder="Поиск по справке..."
          />
        </div>
        <div style={s.layout}>
          <div style={s.sidebar}>
            {filteredSections.map(item => (
              <button type="button" key={item.id} style={{ ...s.nav, ...(item.id === active ? s.navActive : {}) }} onClick={() => setActive(item.id)}>
                <Highlight text={item.title} query={query} />
              </button>
            ))}
            {filteredSections.length === 0 && <div style={s.noResults}>Ничего не найдено</div>}
          </div>
          <div style={s.content}>
            <h2 style={s.title}><Highlight text={section.title} query={query} /></h2>
            <div style={s.text}>{renderSection(section, query)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Guide({ steps }) {
  return <ol style={s.guide}>{steps.map(step => <li key={step}>{step}</li>)}</ol>;
}

function Note({ children }) {
  return <div style={s.note}>{children}</div>;
}

function sectionText(section) {
  const nodeText = DOCUMENTED_NODES.map(node => `${node.label} ${node.desc} ${node.purpose} ${node.when} ${(node.nuances || []).join(' ')} ${node.example}`).join(' ');
  const placeholders = Object.entries(SYSTEM_PLACEHOLDERS).map(([name, desc]) => `${name} ${desc}`).join(' ');
  return `${section.title} ${section.id} ${section.id === 'nodes' ? nodeText : ''} ${section.id === 'variables' ? placeholders + ' inventory achievement формула плейсхолдеры' : ''} ${section.id === 'telegram' ? 'telegram тестирование форматирование лимиты webhook start' : ''}`;
}

function renderSection(section, query) {
  if (section.id === 'variables') {
    return <>
      <p><Highlight text="Переменная появляется в ветке только после выполнения соответствующей ноды. Boolean-переменные до первого изменения считаются false, числовые - 0, текстовые - пустая строка." query={query} /></p>
      <p><Highlight text="В тексте используйте плейсхолдеры вида {{Монеты}}. После ввода {{ откроется список всех переменных проекта. Валидный плейсхолдер подсвечивается зелёным, неизвестный - красным." query={query} /></p>
      <SystemPlaceholderList query={query} />
      <Note><Highlight text="Дополнительные системные плейсхолдеры: {{inventory.Название предмета}} возвращает название предмета, {{inventory.my.Название предмета}} возвращает строку вида Кукуруза x5, {{inventory.my.amount.Название предмета}} возвращает количество. {{achievement.Название достижения}} возвращает название достижения и, если задана, ссылку на картинку." query={query} /></Note>
    </>;
  }
  if (section.id === 'nodes') return <NodeCatalog query={query} />;
  return section.content;
}

function Highlight({ text, query }) {
  const value = String(text || '');
  const q = query.trim();
  if (!q) return value;
  const lower = value.toLowerCase();
  const qLower = q.toLowerCase();
  const parts = [];
  let cursor = 0;
  let index = lower.indexOf(qLower);
  while (index !== -1) {
    if (index > cursor) parts.push(value.slice(cursor, index));
    parts.push(<mark key={`${index}-${parts.length}`} style={s.searchMark}>{value.slice(index, index + q.length)}</mark>);
    cursor = index + q.length;
    index = lower.indexOf(qLower, cursor);
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

function SystemPlaceholderList({ query = '' }) {
  return (
    <div style={s.placeholderBox}>
      <div style={s.placeholderTitle}>Системные плейсхолдеры Telegram</div>
      <div style={s.placeholderList}>
        {Object.entries(SYSTEM_PLACEHOLDERS).map(([name, description]) => (
          <div key={name} style={s.placeholderRow}>
            <code style={s.placeholderCode}>{<Highlight text={`{{${name}}}`} query={query} />}</code>
            <span style={s.placeholderDash}>-</span>
            <span style={s.placeholderDesc}><Highlight text={description} query={query} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ name, text, query }) {
  return <div style={s.node}><div style={s.nodeName}><Highlight text={name} query={query} /></div><div><Highlight text={text} query={query} /></div></div>;
}

function NodeCatalog({ query = '' }) {
  const q = query.trim().toLowerCase();
  return (
    <div>
      {NODE_CATEGORIES.map(category => (
        <div key={category.id} style={s.nodeCategory}>
          <div style={s.nodeCategoryTitle}>{category.label}</div>
          <div style={s.nodeGrid}>
            {DOCUMENTED_NODES.filter(node => node.category === category.id && (!q || `${node.label} ${node.desc} ${node.purpose} ${node.when} ${(node.nuances || []).join(' ')}`.toLowerCase().includes(q))).map(node => (
              <Node key={node.type} name={`${node.icon} ${node.label}`} text={node.purpose} query={query} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const s = {
  overlay: { position: 'fixed', inset: 0, zIndex: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, background: 'rgba(3, 6, 16, 0.78)' },
  modal: { width: 'min(1040px, 96vw)', height: 'min(760px, 90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#171927', border: '1px solid #343a5b', borderRadius: 14, boxShadow: '0 22px 70px rgba(0,0,0,0.65)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '17px 20px', borderBottom: '1px solid #2d3458', background: 'linear-gradient(135deg, #20243a, #1a1c2a)' },
  searchWrap: { padding: '10px 12px', background: '#12131a', borderBottom: '1px solid #2d3458' },
  search: { width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 7, color: '#e2e8f0', padding: '9px 11px', fontSize: 14, outline: 'none' },
  eyebrow: { color: '#818cf8', fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase' },
  heading: { marginTop: 2, color: '#f1f5f9', fontSize: 22, fontWeight: 800 },
  close: { border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 28, cursor: 'pointer' },
  layout: { minHeight: 0, flex: 1, display: 'flex' },
  sidebar: { width: 220, flexShrink: 0, padding: 12, background: '#12131a', borderRight: '1px solid #2d3458' },
  nav: { display: 'block', width: '100%', marginBottom: 4, padding: '9px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: '#94a3b8', fontSize: 13, textAlign: 'left', cursor: 'pointer' },
  navActive: { background: '#293056', color: '#e0e7ff', fontWeight: 700 },
  noResults: { color: '#64748b', fontSize: 12, padding: 10 },
  content: { flex: 1, overflowY: 'auto', padding: '23px 26px' },
  title: { margin: '0 0 13px', color: '#f1f5f9', fontSize: 22 },
  text: { color: '#cbd5e1', fontSize: 14, lineHeight: 1.7 },
  guide: { margin: '12px 0', paddingLeft: 20 },
  note: { marginTop: 14, padding: '10px 12px', color: '#bfdbfe', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(96,165,250,0.28)', borderRadius: 7 },
  placeholderBox: { marginTop: 14, padding: '13px 14px', background: '#111827', border: '1px solid #2d3458', borderRadius: 8 },
  placeholderTitle: { marginBottom: 10, color: '#f1f5f9', fontSize: 13, fontWeight: 800 },
  placeholderList: { display: 'grid', gap: 7 },
  placeholderRow: { display: 'grid', gridTemplateColumns: 'minmax(180px, max-content) 12px 1fr', gap: 8, alignItems: 'baseline' },
  placeholderCode: { color: '#c4b5fd', background: '#0b1020', border: '1px solid #28324f', borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' },
  placeholderDash: { color: '#64748b' },
  placeholderDesc: { color: '#cbd5e1' },
  nodeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 9 },
  nodeCategory: { marginBottom: 18 },
  nodeCategoryTitle: { marginBottom: 7, color: '#818cf8', fontSize: 11, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase' },
  node: { padding: '10px 11px', color: '#aeb9ca', background: '#12131a', border: '1px solid #2d3458', borderRadius: 7, fontSize: 12, lineHeight: 1.5 },
  nodeName: { marginBottom: 3, color: '#c4b5fd', fontSize: 13, fontWeight: 700 },
  searchMark: { background: 'transparent', color: 'inherit', border: '1px solid #ef4444', borderRadius: 3, padding: '0 2px' },
};
