import React, { useMemo, useState } from 'react';
import { DOCUMENTED_NODES, NODE_CATEGORIES } from '../nodes/nodeCatalog';
import { SYSTEM_PLACEHOLDERS } from '../../telegramLimits';

const SECTIONS = [
  { id: 'start', title: 'Быстрый старт' },
  { id: 'canvas', title: 'Рабочая зона' },
  { id: 'variables', title: 'Переменные' },
  { id: 'conditions', title: 'Условия и ветвление' },
  { id: 'keyboard', title: 'Клавиатура' },
  { id: 'subscenario', title: 'Подсценарии и циклы' },
  { id: 'progress', title: 'Прогресс и экономика' },
  { id: 'telegram', title: 'Telegram-бот' },
  { id: 'formatting', title: 'Форматирование и лимиты' },
  { id: 'simulator', title: 'Симулятор' },
  { id: 'nodes', title: 'Каталог нод' },
  { id: 'admin', title: 'Администрирование' },
];

export default function HelpModal({ onClose }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return SECTIONS;
    return SECTIONS.filter(section => sectionSearchText(section).toLowerCase().includes(normalizedQuery));
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
              const q = event.target.value.trim().toLowerCase();
              const next = SECTIONS.find(sec => sectionSearchText(sec).toLowerCase().includes(q));
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

// ─── Section renderers ───────────────────────────────────────────────────────

function renderSection(section, query) {
  const H = ({ text }) => <Highlight text={text} query={query} />;
  const q = query;

  if (section.id === 'start') return (
    <>
      <p><H text="Точка входа в каждый сценарий — нода «Глобальное меню». Она открывается по команде /start независимо от текущего прогресса игрока. Сценарий без этой ноды не пройдёт проверку." /></p>
      <Guide steps={[
        'Добавьте ноду из панели слева или через правый клик по рабочей зоне.',
        'Соедините ноды: тяните от точки выхода (правая сторона ноды) к точке входа следующей.',
        'Двойной клик по стрелке — удалить связь. Одна ветка не может иметь двух стрелок из одного выхода.',
        'Ctrl+S — сохранить сценарий. Перед запуском бота он сохраняется автоматически.',
        'Кнопка «Проверить» запускает валидацию — сообщает об ошибках до отправки игрокам.',
        'Кнопка «Тест» открывает встроенный симулятор без подключения к Telegram.',
        'Для запуска реального бота нажмите «Создать Telegram-бота» и вставьте токен от @BotFather.',
      ]} />
      <Note><H text="В новых сценариях нода «Начало истории» (startNode) не нужна — /start напрямую открывает «Глобальное меню»." /></Note>
    </>
  );

  if (section.id === 'canvas') return (
    <>
      <p><H text="Рабочая зона — холст ReactFlow. Все ноды и связи хранятся как JSON и сохраняются на сервере." /></p>
      <KbSection query={q} />
      <h3 style={s.h3}><H text="Связи" /></h3>
      <ul style={s.ul}>
        <li><H text="Один выход — одна входящая стрелка. Из одного выхода нельзя провести две стрелки." /></li>
        <li><H text="Комментарии можно присоединить второй пунктирной стрелкой (оранжевой) — на выполнение сценария они не влияют." /></li>
        <li><H text="При выборе ноды связанные стрелки подсвечиваются анимированным пунктиром." /></li>
      </ul>
      <h3 style={s.h3}><H text="Группы" /></h3>
      <ul style={s.ul}>
        <li><H text="Выделите 2+ ноды (Ctrl+перетяжка рамкой) и нажмите «Группа»." /></li>
        <li><H text="При перемещении группы дочерние ноды двигаются вместе." /></li>
        <li><H text="Нода автоприкрепляется к группе при переносе внутрь и отделяется при выносе наружу." /></li>
        <li><H text="Группа не влияет на выполнение сценария." /></li>
      </ul>
      <h3 style={s.h3}><H text="История изменений" /></h3>
      <ul style={s.ul}>
        <li><H text="Кнопка «История» показывает снимки сценария. Каждый снимок — реальное изменение, а не каждое сохранение." /></li>
        <li><H text="Сравнение: слева текущая версия, справа историческая. Список изменённых полей показывается рядом." /></li>
      </ul>
    </>
  );

  if (section.id === 'variables') return (
    <>
      <p><H text="Переменные — основной инструмент хранения прогресса игрока. Они создаются нодой «Переменные» и сохраняются в базе данных отдельно для каждого игрока." /></p>
      <h3 style={s.h3}><H text="Типы переменных" /></h3>
      <Table rows={[
        ['Тип', 'Значение по умолчанию', 'Операции'],
        ['number', '0', 'установить, прибавить, вычесть, умножить, разделить'],
        ['boolean', 'false', 'установить true/false'],
        ['text', '(пустая строка)', 'установить текст (поддерживает {{Переменная}})'],
      ]} query={q} />
      <h3 style={s.h3}><H text="Плейсхолдеры в тексте" /></h3>
      <ul style={s.ul}>
        <li><H text="Синтаксис: {{Монеты}} — вставляет текущее значение переменной." /></li>
        <li><H text="После ввода {{ — автоматически открывается список всех переменных проекта." /></li>
        <li><H text="Валидный плейсхолдер подсвечивается зелёным, неизвестный — красным." /></li>
        <li><H text="Если переменная не найдена во время выполнения, подставляется {{varName}} как есть (видно в чате — полезно при отладке)." /></li>
        <li><H text="Переменная существует в ветке только после того, как нода «Переменные» была выполнена." /></li>
      </ul>
      <h3 style={s.h3}><H text="Переименование переменной" /></h3>
      <p><H text="В инспекторе ноды «Переменные» нажмите на имя переменной и измените его — имя заменится сразу во всём сценарии: в условиях, плейсхолдерах и полях выбора переменной." /></p>
      <h3 style={s.h3}><H text="Глобальные переменные" /></h3>
      <p><H text="Нода «Глобальные переменные» изменяет переменные, общие для всех игроков (счётчики событий, флаги сезона и т.д.). Доступны в ветвлении через источник «Глоб. переменная»." /></p>
      <SystemPlaceholderList query={q} />
      <Note><H text="Дополнительные системные плейсхолдеры: {{reputation.person.Имя}} / {{reputation.guild.Имя}} / {{reputation.city.Имя}} и др. — числовое значение репутации. {{inventory.my.Предмет}} — «Предмет x5», {{inventory.my.amount.Предмет}} — количество. {{achievement.Ключ}} — название достижения. {{codex.ключ}} — текст записи кодекса (пусто, если не открыта)." /></Note>
      <h3 style={s.h3}><H text="Аргументы команды" /></h3>
      <p><H text="Внутри ветки «Своя команда» доступны плейсхолдеры command.args (строка целиком), command.arg1, command.arg2 и т.д. Вне этой ветки они пусты." /></p>
    </>
  );

  if (section.id === 'conditions') return (
    <>
      <p><H text="Условия используются в ноде «Проверка условий» (branchingNode) и на кнопках клавиатуры. Все условия одной ветки объединяются по AND — должны выполниться все." /></p>
      <h3 style={s.h3}><H text="Источники значений" /></h3>
      <Table rows={[
        ['Источник', 'Что проверяется'],
        ['Переменная', 'Пользовательская переменная игрока (number/boolean/text)'],
        ['Инвентарь', 'Количество предмета в инвентаре игрока'],
        ['Отношения', 'Числовое отношение с персонажем'],
        ['Достижение', 'Есть или нет конкретное достижение у игрока'],
        ['Глоб. переменная', 'Глобальная переменная, общая для всех игроков'],
      ]} query={q} />
      <h3 style={s.h3}><H text="Операторы" /></h3>
      <Table rows={[
        ['Оператор', 'Применимость', 'Описание'],
        ['==', 'все типы', 'Равно'],
        ['!=', 'все типы', 'Не равно'],
        ['>', 'number, inventory, relation', 'Больше'],
        ['<', 'number, inventory, relation', 'Меньше'],
        ['>=', 'number, inventory, relation', 'Больше или равно'],
        ['<=', 'number, inventory, relation', 'Меньше или равно'],
        ['has', 'achievement, inventory', 'Достижение открыто / предмет есть в инвентаре'],
        ['not_has', 'achievement, inventory', 'Достижение не открыто / предмета нет'],
      ]} query={q} />
      <h3 style={s.h3}><H text="Нода «Проверка условий»" /></h3>
      <ul style={s.ul}>
        <li><H text="Ветки проверяются сверху вниз. Срабатывает первая, у которой выполнены все условия." /></li>
        <li><H text="Ветку «Иначе» (без условий) всегда ставьте последней — она срабатывает, если ни одна другая не подошла." /></li>
        <li><H text="Если ни одна ветка не подходит и «Иначе» нет — выполнение останавливается." /></li>
      </ul>
      <h3 style={s.h3}><H text="Boolean-переменные в условиях" /></h3>
      <p><H text="Если выбранная переменная логическая (boolean), поле значения заменяется на переключатель true/false вместо текстового поля." /></p>
    </>
  );

  if (section.id === 'keyboard') return (
    <>
      <p><H text="Нода «Выбор игрока» (keyboardNode) отправляет inline-кнопки Telegram и ждёт нажатия. Каждая кнопка — отдельная ветка выполнения." /></p>
      <h3 style={s.h3}><H text="Как работает" /></h3>
      <ul style={s.ul}>
        <li><H text="Перед клавиатурой бот отправляет текст «Ваш выбор:» — это фиксированное поведение." /></li>
        <li><H text="Нода не продолжает сценарий сама — ждёт нажатия игрока." /></li>
        <li><H text="Подписи кнопок поддерживают плейсхолдеры {{Переменная}}." /></li>
        <li><H text="Несколько клавиатур подряд: каждая следующая редактирует то же сообщение (не отправляет новое), чтобы не засорять чат." /></li>
      </ul>
      <h3 style={s.h3}><H text="Условия показа кнопок" /></h3>
      <ul style={s.ul}>
        <li><H text="У каждой кнопки можно задать одно или несколько условий показа. Условия работают по AND — кнопка показывается только если все выполнены." /></li>
        <li><H text="Если условие включено, в редакторе рядом с вариантом показывается синяя шестерёнка. В игре её не видно." /></li>
        <li><H text="В подсказках условий клавиатуры показываются переменные именно для выбранного источника." /></li>
        <li><H text="Системные плейсхолдеры скрыты в обычном списке, но появляются при вводе системного имени (telegram., achievements. и т.д.)." /></li>
      </ul>
      <h3 style={s.h3}><H text="Таймаут" /></h3>
      <p><H text="Если подключить выход «Таймаут» к ноде, бот выполнит эту ветку, если игрок не нажал кнопку в течение указанного времени. Без этого выхода клавиатура ждёт бесконечно." /></p>
    </>
  );

  if (section.id === 'subscenario') return (
    <>
      <h3 style={s.h3}><H text="Подсценарии" /></h3>
      <p><H text="Нода «Вызвать подсценарий» запускает общую переиспользуемую ветку (магазин, бой, диалог) и после «Возврата» возвращает выполнение к следующей ноде." /></p>
      <ul style={s.ul}>
        <li><H text="В инспекторе выберите точку входа подсценария (любую ноду на схеме)." /></li>
        <li><H text="В конце каждой ветки подсценария поставьте ноду «Возврат из подсценария»." /></li>
        <li><H text="«Возврат» без предшествующего вызова завершает выполнение (ветка прерывается)." /></li>
        <li><H text="Подсценарии можно вкладывать (стек вызовов). Глубина не ограничена, но за 300 шагов выполнение прекратится." /></li>
      </ul>
      <h3 style={s.h3}><H text="Циклы" /></h3>
      <p><H text="Нода «Цикл» выполняет подключённое тело фиксированное количество раз, затем переходит к выходу «Завершить»." /></p>
      <ul style={s.ul}>
        <li><H text="Соедините выход «Тело» с нодами цикла, а последнюю ноду тела — обратно с нодой «Цикл»." /></li>
        <li><H text="Нода «Выход из цикла» прерывает цикл досрочно и переходит к выходу «Завершить» указанного цикла." /></li>
        <li><H text="В инспекторе «Выхода из цикла» выберите, какой именно цикл прерывать (для вложенных)." /></li>
      </ul>
      <Note><H text="Общий лимит выполнения — 300 шагов на один вызов. Бесконечный цикл без breakLoopNode остановится автоматически." /></Note>
    </>
  );

  if (section.id === 'progress') return (
    <>
      <h3 style={s.h3}><H text="Инвентарь" /></h3>
      <ul style={s.ul}>
        <li><H text="Нода «Изменить инвентарь» — добавить, убрать или установить количество предмета." /></li>
        <li><H text="Нода «Инвентарь» — показать список предметов игрока (формат строки настраивается)." /></li>
        <li><H text="Плейсхолдеры: {{inventory.my.Предмет}} → «Предмет x5», {{inventory.my.amount.Предмет}} → количество числом." /></li>
        <li><H text="Количество ≤ 0 удаляет запись из инвентаря." /></li>
      </ul>
      <h3 style={s.h3}><H text="Репутация и отношения" /></h3>
      <ul style={s.ul}>
        <li><H text="Числовой показатель с персонажем, гильдией, городом, фракцией, организацией, регионом или божеством." /></li>
        <li><H text="В ноде выбирается тип (Персонаж / Гильдия / Город / ...) и название объекта." /></li>
        <li><H text="Плейсхолдер: {{reputation.person.Харбек Крепкоплечий}}, {{reputation.guild.Стальная Длань}}, {{reputation.city.Вархейм}}, {{reputation.faction.Орден Рассвета}} и т.д." /></li>
        <li><H text="Ключ для «Проверки условий» — полный вид: person.Харбек Крепкоплечий (источник «Отношения»)." /></li>
        <li><H text="Операторы проверки: > < >= <= == !=." /></li>
        <li><H text="Можно включить уведомление игрока при изменении. Доступны {{target}} (название) и {{value}} (новое значение)." /></li>
        <li><H text="Дефолтный текст уведомления: «Ваше отношение с &quot;{{target}}&quot; стало {{value}}.»" /></li>
      </ul>
      <h3 style={s.h3}><H text="Достижения" /></h3>
      <ul style={s.ul}>
        <li><H text="Ключ достижения должен быть стабильным и уникальным — не менять после выдачи игрокам." /></li>
        <li><H text="Повторный вызов не создаёт дубликат." /></li>
        <li><H text="Нода может выдавать награды: предметы и переменные." /></li>
        <li><H text="{{achievements.unlocked}} — открытых у игрока, {{achievements.total}} — всего в сценарии." /></li>
        <li><H text="{{achievements.list}} — список названий разблокированных достижений (каждое с «—», через перенос строки)." /></li>
        <li><H text="{{achievements.text.ключ}} — название конкретного достижения. Доступно всегда, независимо от того, получено оно или нет." /></li>
        <li><H text="Нода «Достижения» показывает прогресс и список разблокированных достижений." /></li>
      </ul>
      <h3 style={s.h3}><H text="Промокоды" /></h3>
      <ul style={s.ul}>
        <li><H text="Промокоды создаются в Админ-панели: код, максимальное число использований, дата истечения, награды." /></li>
        <li><H text="Нода «Запросить промокод» ждёт ввода от игрока." /></li>
        <li><H text="Команда /promo CODE тоже работает из любого места сценария." /></li>
        <li><H text="Один игрок может использовать каждый код только один раз." /></li>
      </ul>
      <h3 style={s.h3}><H text="Покупки Telegram Stars" /></h3>
      <ul style={s.ul}>
        <li><H text="Товар создаётся в Админ-панели: ключ, название, цена в Stars, награды (предметы/переменные)." /></li>
        <li><H text="В ноде «Покупка Stars» указывается стабильный ключ товара." /></li>
        <li><H text="После успешной оплаты игрок получает награды и сценарий продолжается." /></li>
      </ul>
      <h3 style={s.h3}><H text="Контрольная точка и сброс прогресса" /></h3>
      <ul style={s.ul}>
        <li><H text="«Контрольная точка» — явное сохранение позиции игрока. Текущая позиция сохраняется автоматически, но checkpoint — надёжная точка возврата для крупных обновлений." /></li>
        <li><H text="«Сброс прогресса» очищает историю, инвентарь, отношения, достижения и переменные. Переменные из списка сохранения остаются." /></li>
        <li><H text="После сброса сценарий продолжается по обычному выходу этой ноды." /></li>
      </ul>
      <h3 style={s.h3}><H text="Кодекс" /></h3>
      <ul style={s.ul}>
        <li><H text="Нода «Кодекс» — только определение записи (ключ + текст). При прохождении ничего не делает и не разблокирует запись." /></li>
        <li><H text="Нода «Разблокировать кодекс» — единственный способ открыть (true) или закрыть (false) запись для игрока. При открытии отправляет настраиваемое сообщение (по умолчанию «Кодекс обновлен»)." /></li>
        <li><H text="Нода «Редактировать кодекс» — обновляет текст записи без изменения статуса блокировки." /></li>
        <li><H text="{{codex.ключ}} подставляет текст записи, если она разблокирована. До открытия — пустая строка." /></li>
        <li><H text="Статус проверяется в условиях через источник «Переменная», имя codex.ключ (значение boolean)." /></li>
        <li><H text="Ключ указывается без префикса codex. — он добавляется автоматически." /></li>
      </ul>
    </>
  );

  if (section.id === 'telegram') return (
    <>
      <p><H text="Telegram-бот запускается через токен от @BotFather. Сценарий автоматически сохраняется перед стартом." /></p>
      <h3 style={s.h3}><H text="Встроенные команды" /></h3>
      <Table rows={[
        ['Команда', 'Куда ведёт'],
        ['/start', 'Открывает «Глобальное меню» (menuNode)'],
        ['/menu', 'То же, что /start'],
        ['/settings', 'Открывает «Настройки» (settingsNode), если добавлена'],
        ['/promo CODE', 'Применяет промокод из любого места сценария'],
        ['/shop', 'Список товаров Telegram Stars (если настроены)'],
      ]} query={q} />
      <Note><H text="Имена start, menu, settings, promo, shop, ref зарезервированы и недоступны для «Своих команд»." /></Note>
      <h3 style={s.h3}><H text="Пользовательские команды" /></h3>
      <ul style={s.ul}>
        <li><H text="Имя команды — латиница, цифры, подчёркивание, до 32 символов (/^[a-z0-9_]{1,32}$/)." /></li>
        <li><H text="Команды обновляются при запуске бота и показываются в системном меню Telegram (если включено)." /></li>
        <li><H text="Аргументы команды доступны как command.args, command.arg1, command.arg2 только внутри ветки этой команды." /></li>
      </ul>
      <h3 style={s.h3}><H text="Режимы работы" /></h3>
      <ul style={s.ul}>
        <li><H text="Polling (по умолчанию): бот сам запрашивает обновления. Работает без публичного URL." /></li>
        <li><H text="Webhook: если задана переменная окружения PUBLIC_BASE_URL, бот переключается на вебхук автоматически." /></li>
      </ul>
      <h3 style={s.h3}><H text="Логи Telegram" /></h3>
      <p><H text="В редакторе кнопка «Логи» показывает последние 300 записей (метка времени, уровень, сообщение). Логи обновляются каждые 3 секунды, пока бот запущен." /></p>
    </>
  );

  if (section.id === 'formatting') return (
    <>
      <h3 style={s.h3}><H text="HTML-форматирование текста" /></h3>
      <p><H text="Telegram поддерживает ограниченный HTML в тексте сообщений. Конструктор экранирует содержимое и сохраняет разрешённые теги." /></p>
      <Table rows={[
        ['Тег', 'Результат'],
        ['<b>текст</b>', 'Жирный'],
        ['<i>текст</i>', 'Курсив'],
        ['<u>текст</u>', 'Подчёркнутый'],
        ['<s>текст</s>', 'Зачёркнутый'],
        ['<code>текст</code>', 'Моноширинный (inline)'],
        ['<pre>текст</pre>', 'Блок кода'],
        ['<tg-spoiler>текст</tg-spoiler>', 'Спойлер (скрытый текст)'],
        ['<a href="url">текст</a>', 'Ссылка'],
      ]} query={q} />
      <h3 style={s.h3}><H text="Лимиты Telegram" /></h3>
      <Table rows={[
        ['Что', 'Лимит'],
        ['Текст сообщения', '4 096 символов'],
        ['Подпись к медиа', '1 024 символа'],
        ['Описание команды', '256 символов'],
        ['Вопрос опроса', '300 символов'],
        ['Вариант опроса', '100 символов (2–10 вариантов)'],
        ['Название счёта (Stars)', '32 символа'],
        ['Описание счёта (Stars)', '255 символов'],
        ['Фотография', 'до 10 MB'],
        ['Файл / видео / аудио', 'до 50 MB'],
        ['Видеокружок', 'MP4, не более 60 сек'],
      ]} query={q} />
      <h3 style={s.h3}><H text="Медиа-альбом" /></h3>
      <ul style={s.ul}>
        <li><H text="Альбом — только фото или только видео, от 2 до 10 файлов." /></li>
        <li><H text="Видеокружки и аудио нельзя добавлять в альбом." /></li>
        <li><H text="Для смешанных сообщений (текст + медиа) используйте «Цепочку сообщений»." /></li>
      </ul>
      <h3 style={s.h3}><H text="Нода «Расчёт чисел» (формула)" /></h3>
      <ul style={s.ul}>
        <li><H text="Поддерживает операции: установить, прибавить (+), вычесть (–), умножить (×), разделить (÷)." /></li>
        <li><H text="Операция % означает «взять N процентов от текущего значения»." /></li>
        <li><H text="Работает только с числовыми переменными." /></li>
      </ul>
      <h3 style={s.h3}><H text="HTTP-запрос" /></h3>
      <ul style={s.ul}>
        <li><H text="URL и тело запроса поддерживают {{Переменная}}." /></li>
        <li><H text="Путь в JSON-ответе указывается через точку: data.user.name." /></li>
        <li><H text="URL должен начинаться с http:// или https://." /></li>
        <li><H text="В симуляторе HTTP всегда возвращает «(симуляция)»." /></li>
      </ul>
    </>
  );

  if (section.id === 'simulator') return (
    <>
      <p><H text="Симулятор запускается локально в браузере — без Telegram и без записи в базу данных. Поведение воспроизводит рантайм максимально точно." /></p>
      <h3 style={s.h3}><H text="Возможности" /></h3>
      <ul style={s.ul}>
        <li><H text="Журнал выполнения: каждая нода записывается в лог с типом и данными." /></li>
        <li><H text="Переменные: можно просматривать и редактировать вручную через панель переменных." /></li>
        <li><H text="Задержки: реальный обратный отсчёт, кнопка «Пропустить» для быстрого тестирования." /></li>
        <li><H text="Кнопка play на отдельной ноде — запустить сценарий с этого места." /></li>
        <li><H text="Меню команд ☰ — выполнить любую командную ноду (меню, настройки, свои команды)." /></li>
      </ul>
      <h3 style={s.h3}><H text="Отличия от реального бота" /></h3>
      <Table rows={[
        ['Функция', 'В симуляторе'],
        ['HTTP-запросы', 'Возвращают «(симуляция)», не выполняются'],
        ['Проверка подписки', 'Всегда «подписан»'],
        ['Покупка Stars', 'Показывает тестовые кнопки без оплаты'],
        ['База данных', 'Не затрагивается, прогресс не сохраняется'],
        ['Задержки', 'Реальный таймер, можно пропустить'],
      ]} query={q} />
    </>
  );

  if (section.id === 'nodes') return <NodeCatalog query={query} />;

  if (section.id === 'admin') return (
    <>
      <p><H text="Кнопка «Админ» открывает панель управления: игроки, версии, бэкапы, промокоды, товары, аналитика." /></p>
      <h3 style={s.h3}><H text="Версии сценария и A/B тестирование" /></h3>
      <ul style={s.ul}>
        <li><H text="Каждая «версия» — снимок JSON сценария. Новая версия создаётся вручную перед крупным обновлением." /></li>
        <li><H text="Rollout % — процент игроков, которые получат новую версию. При 100% все старые версии архивируются." /></li>
        <li><H text="Распределение детерминировано: игрок всегда получает ту же версию (не меняется между сессиями)." /></li>
        <li><H text="Старые игроки со старой версией не переключаются автоматически — только при публикации 100%." /></li>
        <li><H text="Хранится не более 50 архивных версий на бота — старые удаляются автоматически при создании новой. Опубликованные версии не затрагиваются." /></li>
      </ul>
      <h3 style={s.h3}><H text="Резервные копии" /></h3>
      <ul style={s.ul}>
        <li><H text="Бэкап содержит файлы проекта и базу данных. Восстановление полное — и файлы, и БД." /></li>
        <li><H text="Telegram-бэкап: отправляет архив в заданный чат по расписанию." /></li>
        <li><H text="Создавайте бэкап перед крупными изменениями сценария." /></li>
      </ul>
      <h3 style={s.h3}><H text="Аналитика" /></h3>
      <ul style={s.ul}>
        <li><H text="Воронка событий: посещения нод, нажатия кнопок, покупки, достижения — топ 100." /></li>
        <li><H text="Дневной график событий за последние 30 дней." /></li>
        <li><H text="Рефералы: количество игроков, пришедших по ссылке." /></li>
        <li><H text="Покупки: количество и сумма в Stars." /></li>
      </ul>
      <h3 style={s.h3}><H text="Игроки" /></h3>
      <ul style={s.ul}>
        <li><H text="Поиск по username, имени или Telegram ID (до 500 результатов)." /></li>
        <li><H text="Для каждого игрока: переменные, инвентарь, отношения, достижения, история выборов." /></li>
        <li><H text="Значения можно редактировать прямо из панели." /></li>
      </ul>
      <h3 style={s.h3}><H text="Роли" /></h3>
      <Table rows={[
        ['Роль', 'Права'],
        ['owner', 'Полный доступ, включая удаление проекта'],
        ['editor', 'Редактирование сценария и запуск бота'],
        ['viewer', 'Только просмотр'],
      ]} query={q} />
      <Note><H text="Учётные данные задаются через переменную окружения AUTH_USERS в формате login:password,second:password. Пользователь с ролью owner может управлять доступом других участников." /></Note>
    </>
  );

  return null;
}

// ─── UI components ───────────────────────────────────────────────────────────

function Guide({ steps }) {
  return <ol style={s.guide}>{steps.map(step => <li key={step}>{step}</li>)}</ol>;
}

function Note({ children }) {
  return <div style={s.note}>{children}</div>;
}

function Table({ rows, query }) {
  const [head, ...body] = rows;
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>{head.map(cell => <th key={cell} style={s.th}><Highlight text={cell} query={query} /></th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={i} style={i % 2 === 1 ? s.trAlt : {}}>
              {row.map((cell, j) => <td key={j} style={j === 0 ? s.tdKey : s.td}><Highlight text={cell} query={query} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KbSection({ query }) {
  const rows = [
    ['Ctrl+S', 'Сохранить сценарий'],
    ['Ctrl+Z', 'Отменить (до 80 шагов)'],
    ['Ctrl+Y / Ctrl+Shift+Z', 'Повторить'],
    ['Ctrl+C / Ctrl+V', 'Копировать / Вставить выделенные ноды'],
    ['Ctrl+F', 'Поиск нод (по типу, тексту, nodeId)'],
    ['Delete / Backspace', 'Удалить выделенные ноды и связи'],
    ['Ctrl + перетяжка рамкой', 'Выделить несколько нод'],
    ['Двойной клик по стрелке', 'Удалить связь'],
    ['ПКМ по рабочей зоне', 'Добавить ноду в этом месте'],
    ['Клик по ноде', 'Открыть инспектор'],
    ['Двойной клик по ноде', 'Развернуть / Свернуть'],
  ];
  return (
    <>
      <h3 style={s.h3}><Highlight text="Горячие клавиши" query={query} /></h3>
      <Table rows={[['Клавиши', 'Действие'], ...rows]} query={query} />
    </>
  );
}

function Highlight({ text, query }) {
  const value = String(text || '');
  const q = (query || '').trim();
  if (!q) return value;
  const lower = value.toLowerCase();
  const qLower = q.toLowerCase();
  const parts = [];
  let cursor = 0;
  let idx = lower.indexOf(qLower);
  while (idx !== -1) {
    if (idx > cursor) parts.push(value.slice(cursor, idx));
    parts.push(<mark key={`${idx}-${parts.length}`} style={s.searchMark}>{value.slice(idx, idx + q.length)}</mark>);
    cursor = idx + q.length;
    idx = lower.indexOf(qLower, cursor);
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
            <code style={s.placeholderCode}><Highlight text={`{{${name}}}`} query={query} /></code>
            <span style={s.placeholderDash}>—</span>
            <span style={s.placeholderDesc}><Highlight text={description} query={query} /></span>
          </div>
        ))}
        <div style={s.placeholderRow}>
          <code style={s.placeholderCode}><Highlight text="{{codex.ключ}}" query={query} /></code>
          <span style={s.placeholderDash}>—</span>
          <span style={s.placeholderDesc}><Highlight text="Текст записи кодекса, если игрок уже открыл её. До открытия — пустая строка." query={query} /></span>
        </div>
        <div style={s.placeholderRow}>
          <code style={s.placeholderCode}><Highlight text="{{reputation.person.Имя}}" query={query} /></code>
          <span style={s.placeholderDash}>—</span>
          <span style={s.placeholderDesc}><Highlight text="Репутация с персонажем. Тип: person, guild, city, faction, organization, region, deity." query={query} /></span>
        </div>
        <div style={s.placeholderRow}>
          <code style={s.placeholderCode}><Highlight text="{{inventory.my.Предмет}}" query={query} /></code>
          <span style={s.placeholderDash}>—</span>
          <span style={s.placeholderDesc}><Highlight text="Строка вида «Предмет x5»." query={query} /></span>
        </div>
        <div style={s.placeholderRow}>
          <code style={s.placeholderCode}><Highlight text="{{inventory.my.amount.Предмет}}" query={query} /></code>
          <span style={s.placeholderDash}>—</span>
          <span style={s.placeholderDesc}><Highlight text="Количество предмета числом." query={query} /></span>
        </div>
        <div style={s.placeholderRow}>
          <code style={s.placeholderCode}><Highlight text="{{achievement.Ключ}}" query={query} /></code>
          <span style={s.placeholderDash}>—</span>
          <span style={s.placeholderDesc}><Highlight text="Название разблокированного достижения (только если получено)." query={query} /></span>
        </div>
        <div style={s.placeholderRow}>
          <code style={s.placeholderCode}><Highlight text="{{achievements.list}}" query={query} /></code>
          <span style={s.placeholderDash}>—</span>
          <span style={s.placeholderDesc}><Highlight text="Список названий всех разблокированных достижений игрока (каждое с «—», через перенос строки)." query={query} /></span>
        </div>
        <div style={s.placeholderRow}>
          <code style={s.placeholderCode}><Highlight text="{{achievements.text.ключ}}" query={query} /></code>
          <span style={s.placeholderDash}>—</span>
          <span style={s.placeholderDesc}><Highlight text="Название конкретного достижения. Доступно всегда, независимо от получения." query={query} /></span>
        </div>
        <div style={s.placeholderRow}>
          <code style={s.placeholderCode}><Highlight text="{{command.args}}" query={query} /></code>
          <span style={s.placeholderDash}>—</span>
          <span style={s.placeholderDesc}><Highlight text="Аргументы команды строкой (только внутри ветки «Своя команда»)." query={query} /></span>
        </div>
      </div>
    </div>
  );
}

function NodeCatalog({ query = '' }) {
  const q = query.trim().toLowerCase();
  return (
    <div>
      {NODE_CATEGORIES.map(category => {
        const nodes = DOCUMENTED_NODES.filter(node =>
          node.category === category.id &&
          (!q || `${node.label} ${node.desc} ${node.purpose} ${node.when} ${(node.nuances || []).join(' ')} ${node.example}`.toLowerCase().includes(q))
        );
        if (nodes.length === 0) return null;
        return (
          <div key={category.id} style={s.nodeCategory}>
            <div style={s.nodeCategoryTitle}>{category.label}</div>
            <div style={s.nodeGrid}>
              {nodes.map(node => (
                <NodeCard key={node.type} node={node} query={query} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NodeCard({ node, query }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={s.node} onClick={() => setOpen(v => !v)}>
      <div style={s.nodeName}><Highlight text={`${node.icon} ${node.label}`} query={query} /></div>
      <div style={s.nodeDesc}><Highlight text={node.desc} query={query} /></div>
      {open && (
        <div style={s.nodeDetail}>
          {node.purpose && <p style={s.nodeDetailP}><Highlight text={node.purpose} query={query} /></p>}
          {node.when && <p style={s.nodeDetailWhen}><b>Когда:</b> <Highlight text={node.when} query={query} /></p>}
          {node.nuances && node.nuances.length > 0 && (
            <ul style={s.nodeDetailList}>
              {node.nuances.map(n => <li key={n}><Highlight text={n} query={query} /></li>)}
            </ul>
          )}
          {node.example && <div style={s.nodeDetailExample}><Highlight text={node.example} query={query} /></div>}
        </div>
      )}
    </div>
  );
}

// ─── Search index ────────────────────────────────────────────────────────────

function sectionSearchText(section) {
  const base = `${section.title} ${section.id}`;
  if (section.id === 'nodes') {
    return base + ' ' + DOCUMENTED_NODES.map(n => `${n.label} ${n.desc} ${n.purpose} ${n.when} ${(n.nuances || []).join(' ')} ${n.example}`).join(' ');
  }
  if (section.id === 'variables') {
    return base + ' плейсхолдер переменная boolean number text глобальная codex inventory achievement ' +
      Object.entries(SYSTEM_PLACEHOLDERS).map(([k, v]) => `${k} ${v}`).join(' ');
  }
  const extra = {
    start: 'запуск menuNode старт begin',
    canvas: 'ctrl горячие клавиши undo redo группа group canvas холст стрелка связь',
    conditions: 'условие ветвление branchingNode has not_has инвентарь отношения достижение',
    keyboard: 'клавиатура кнопка inline keyboardNode таймаут условие показа',
    subscenario: 'подсценарий цикл стек вызовов return loop break',
    progress: 'инвентарь отношения достижения промокод покупка stars сброс кодекс checkpoint',
    telegram: 'токен команда start settings menu webhook polling бот',
    formatting: 'html форматирование лимиты медиа альбом формула расчёт http',
    simulator: 'симулятор тест тестирование локально',
    admin: 'версия бэкап аналитика роли игроки rollout ab тестирование admin',
  }[section.id] || '';
  return `${base} ${extra}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = {
  overlay: { position: 'fixed', inset: 0, zIndex: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, background: 'rgba(3, 6, 16, 0.78)' },
  modal: { width: 'min(1100px, 96vw)', height: 'min(800px, 92vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#171927', border: '1px solid #343a5b', borderRadius: 14, boxShadow: '0 22px 70px rgba(0,0,0,0.65)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '17px 20px', borderBottom: '1px solid #2d3458', background: 'linear-gradient(135deg, #20243a, #1a1c2a)', flexShrink: 0 },
  searchWrap: { padding: '10px 12px', background: '#12131a', borderBottom: '1px solid #2d3458', flexShrink: 0 },
  search: { width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 7, color: '#e2e8f0', padding: '9px 11px', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  eyebrow: { color: '#818cf8', fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase' },
  heading: { marginTop: 2, color: '#f1f5f9', fontSize: 22, fontWeight: 800 },
  close: { border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 28, cursor: 'pointer', flexShrink: 0 },
  layout: { minHeight: 0, flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: 200, flexShrink: 0, padding: '10px 8px', background: '#12131a', borderRight: '1px solid #2d3458', overflowY: 'auto' },
  nav: { display: 'block', width: '100%', marginBottom: 2, padding: '8px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: '#94a3b8', fontSize: 13, textAlign: 'left', cursor: 'pointer' },
  navActive: { background: '#293056', color: '#e0e7ff', fontWeight: 700 },
  noResults: { color: '#64748b', fontSize: 12, padding: 10 },
  content: { flex: 1, overflowY: 'auto', padding: '22px 26px' },
  title: { margin: '0 0 14px', color: '#f1f5f9', fontSize: 21, fontWeight: 800 },
  h3: { margin: '20px 0 8px', color: '#e0e7ff', fontSize: 14, fontWeight: 700 },
  text: { color: '#cbd5e1', fontSize: 14, lineHeight: 1.7 },
  ul: { margin: '0 0 4px', paddingLeft: 20 },
  guide: { margin: '12px 0', paddingLeft: 20 },
  note: { marginTop: 14, padding: '10px 12px', color: '#bfdbfe', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(96,165,250,0.28)', borderRadius: 7 },
  tableWrap: { marginTop: 10, marginBottom: 4, overflowX: 'auto' },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: 13 },
  th: { padding: '7px 10px', textAlign: 'left', color: '#818cf8', fontWeight: 700, borderBottom: '1px solid #2d3458', whiteSpace: 'nowrap' },
  td: { padding: '6px 10px', color: '#cbd5e1', borderBottom: '1px solid #1e2540', verticalAlign: 'top' },
  tdKey: { padding: '6px 10px', color: '#c4b5fd', fontFamily: 'monospace', fontSize: 12, borderBottom: '1px solid #1e2540', whiteSpace: 'nowrap', verticalAlign: 'top' },
  trAlt: { background: 'rgba(255,255,255,0.025)' },
  placeholderBox: { marginTop: 14, padding: '13px 14px', background: '#111827', border: '1px solid #2d3458', borderRadius: 8 },
  placeholderTitle: { marginBottom: 10, color: '#f1f5f9', fontSize: 13, fontWeight: 800 },
  placeholderList: { display: 'grid', gap: 7 },
  placeholderRow: { display: 'grid', gridTemplateColumns: 'minmax(200px, max-content) 14px 1fr', gap: 8, alignItems: 'baseline' },
  placeholderCode: { color: '#c4b5fd', background: '#0b1020', border: '1px solid #28324f', borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 },
  placeholderDash: { color: '#64748b' },
  placeholderDesc: { color: '#cbd5e1' },
  nodeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 },
  nodeCategory: { marginBottom: 20 },
  nodeCategoryTitle: { marginBottom: 8, color: '#818cf8', fontSize: 11, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase' },
  node: { padding: '10px 11px', color: '#aeb9ca', background: '#12131a', border: '1px solid #2d3458', borderRadius: 7, fontSize: 12, lineHeight: 1.5, cursor: 'pointer' },
  nodeName: { marginBottom: 3, color: '#c4b5fd', fontSize: 13, fontWeight: 700 },
  nodeDesc: { color: '#8896b0' },
  nodeDetail: { marginTop: 9, paddingTop: 9, borderTop: '1px solid #2d3458' },
  nodeDetailP: { margin: '0 0 5px', color: '#cbd5e1' },
  nodeDetailWhen: { margin: '0 0 5px', color: '#94a3b8' },
  nodeDetailList: { margin: '4px 0', paddingLeft: 16, color: '#94a3b8' },
  nodeDetailExample: { marginTop: 6, color: '#818cf8', fontStyle: 'italic', fontSize: 11 },
  searchMark: { background: 'transparent', color: 'inherit', border: '1px solid #ef4444', borderRadius: 3, padding: '0 2px' },
};
