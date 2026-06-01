import React, { useState } from 'react';
import { DOCUMENTED_NODES, NODE_CATEGORIES } from '../nodes/nodeCatalog';

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
        <p>В тексте используйте плейсхолдеры вида <code>{'{{Монеты}}'}</code>. После ввода <code>{'{{'}</code> откроется список переменных, доступных в выбранной точке сценария. Валидный плейсхолдер подсвечивается зелёным, неизвестный — красным.</p>
        <Note>Если ветки не сходятся, переменные из одной ветки не попадут в другую. При выборе ноды список справа пересчитывается по пути до неё.</Note>
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
  const section = SECTIONS.find(item => item.id === active) || SECTIONS[0];
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
        <div style={s.layout}>
          <div style={s.sidebar}>
            {SECTIONS.map(item => (
              <button type="button" key={item.id} style={{ ...s.nav, ...(item.id === active ? s.navActive : {}) }} onClick={() => setActive(item.id)}>
                {item.title}
              </button>
            ))}
          </div>
          <div style={s.content}>
            <h2 style={s.title}>{section.title}</h2>
            <div style={s.text}>{section.content}</div>
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

function Node({ name, text }) {
  return <div style={s.node}><div style={s.nodeName}>{name}</div><div>{text}</div></div>;
}

function NodeCatalog() {
  return (
    <div>
      {NODE_CATEGORIES.map(category => (
        <div key={category.id} style={s.nodeCategory}>
          <div style={s.nodeCategoryTitle}>{category.label}</div>
          <div style={s.nodeGrid}>
            {DOCUMENTED_NODES.filter(node => node.category === category.id).map(node => (
              <Node key={node.type} name={`${node.icon} ${node.label}`} text={node.purpose} />
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
  eyebrow: { color: '#818cf8', fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase' },
  heading: { marginTop: 2, color: '#f1f5f9', fontSize: 22, fontWeight: 800 },
  close: { border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 28, cursor: 'pointer' },
  layout: { minHeight: 0, flex: 1, display: 'flex' },
  sidebar: { width: 220, flexShrink: 0, padding: 12, background: '#12131a', borderRight: '1px solid #2d3458' },
  nav: { display: 'block', width: '100%', marginBottom: 4, padding: '9px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: '#94a3b8', fontSize: 13, textAlign: 'left', cursor: 'pointer' },
  navActive: { background: '#293056', color: '#e0e7ff', fontWeight: 700 },
  content: { flex: 1, overflowY: 'auto', padding: '23px 26px' },
  title: { margin: '0 0 13px', color: '#f1f5f9', fontSize: 22 },
  text: { color: '#cbd5e1', fontSize: 14, lineHeight: 1.7 },
  guide: { margin: '12px 0', paddingLeft: 20 },
  note: { marginTop: 14, padding: '10px 12px', color: '#bfdbfe', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(96,165,250,0.28)', borderRadius: 7 },
  nodeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 9 },
  nodeCategory: { marginBottom: 18 },
  nodeCategoryTitle: { marginBottom: 7, color: '#818cf8', fontSize: 11, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase' },
  node: { padding: '10px 11px', color: '#aeb9ca', background: '#12131a', border: '1px solid #2d3458', borderRadius: 7, fontSize: 12, lineHeight: 1.5 },
  nodeName: { marginBottom: 3, color: '#c4b5fd', fontSize: 13, fontWeight: 700 },
};
