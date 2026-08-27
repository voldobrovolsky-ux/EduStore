/**
 * Реестр параметров расписания — один источник для экранов и для генератора.
 *
 * Документ: `specs/schedule-block/35-parameters.md` (редакция 2).
 * Решения: AR-129…AR-136. Полнота доказывается воротами **G-61**.
 *
 * Редакция 2 (правки владельца 2026-08-27): учебный год и скелет дня вынесены
 * во внешние блоки; приоритет и спаренность стали рангами; недельные часы
 * выводятся из годовых; у педагога окна обязательны, а не запрещены; отказа
 * «нет решения» больше нет; глубина поиска измеряется вариантами, не секундами.
 */

/** Шаги мастера настройки расписания. Порядок — порядок экранов. */
export const PARAM_STEPS = [
  { no: 1, id: 'load', title: 'Нагрузка' },
  { no: 2, id: 'priority', title: 'Приоритет предмета' },
  { no: 3, id: 'pairing', title: 'Спаренность уроков' },
  { no: 4, id: 'teacher', title: 'Педагоги: время и отдых' },
  { no: 5, id: 'search', title: 'Глубина поиска' },
] as const;
export type ParamStep = (typeof PARAM_STEPS)[number]['id'];

/**
 * Блоки-владельцы величин, которые расписание ЧИТАЕТ и не хранит. Попытка
 * собрать их вторым вводом заводит второй источник истины (AR-68, AR-45).
 */
export const EXTERNAL_SOURCES = [
  { id: 'calendar', title: 'Календарь', gives: ['учебный год', 'периоды', 'каникулы', 'нерабочие дни', 'число учебных недель'] },
  { id: 'skeleton', title: 'Скелет дня', gives: ['начало дня', 'длина урока', 'перемены', 'позиции звонков'] },
  { id: 'plan', title: 'Учебный план', gives: ['годовых часов предмета по классам'] },
  { id: 'contingent', title: 'Контингент', gives: ['классы', 'параллели', 'группы и их состав'] },
  { id: 'staff', title: 'Персонал', gives: ['педагоги и роли'] },
] as const;

/**
 * Природа величины. Смешение природ — источник правок, которые школа делает
 * там, где правка бессмысленна:
 *   input   — задаёт модератор;
 *   norm    — задаёт закон, в коде константой; ужесточить можно, ослабить нет;
 *   derived — вычисляет движок, ввода не существует.
 */
export type ParamKind = 'input' | 'norm' | 'derived';

/** Есть в коде · вводится этим реестром · объявлен и выключен в версии. */
export type ParamStatus = 'present' | 'new' | 'slot';

export type ParamControl = 'number' | 'time' | 'select' | 'segment' | 'multiselect' | 'grid' | 'readonly';

export interface ScheduleParam {
  id: string;
  step: ParamStep;
  label: string;
  kind: ParamKind;
  status: ParamStatus;
  control: ParamControl;
  min?: number;
  max?: number;
  values?: readonly (string | number)[];
  default?: string | number | boolean;
  /** Верхняя граница, заданная НОРМОЙ: параметр ввода не вправе её превысить. */
  normCap?: number;
  normSource?: string;
  /** Потребитель значения: ограничение `H*`, маркер качества либо проекция. */
  feeds: readonly string[];
  refusals?: readonly string[];
}

// ─────────────────── приоритет и спаренность (AR-134) ───────────────────

/**
 * **Приоритет предмета** — 1…6, где 1 самый главный. Приоритеты ПОВТОРЯЮТСЯ:
 * несколько предметов могут иметь один и тот же приоритет и делят начало дня
 * между собой.
 *
 * Правило: в дне класса уроки идут по НЕУБЫВАНИЮ приоритета — считая по началу
 * урока (для спаренного блока это его первая позиция). Пример владельца:
 * физкультура и математика обе первого приоритета, физкультура одиночная стоит
 * первой, математика спаренная начинается со второй и занимает вторую и третью;
 * предмет второго приоритета встаёт четвёртым. Последовательность 1-1-1-2
 * неубывающая — нарушения нет, хотя третья позиция занята первым приоритетом.
 *
 * Следствие, названное явно: **продолжение спаренного блока вправе выходить за
 * зону своего приоритета**, начало — нет.
 */
export const PRIORITIES = [1, 2, 3, 4, 5, 6] as const;
export type Priority = (typeof PRIORITIES)[number];

/**
 * Вес приоритета. Шкала удваивающаяся, и это не вкус, а следствие требования
 * «сначала первые, потом вторые»:
 *
 *   W(p) = 2^(6−p)  →  32, 16, 8, 4, 2, 1
 *
 * При такой шкале **один урок приоритета p важнее всех уроков более низких
 * приоритетов вместе взятых** (32 > 16+8+4+2+1 = 31). Это единственное с
 * точностью до множителя семейство целых весов, при котором размен «уступить
 * один сильный приоритет ради нескольких слабых» никогда не выгоден — то есть
 * порядок приоритетов остаётся порядком, а не превращается в торг.
 *
 * Линейная шкала (6−p) этим свойством не обладает: она делает перестановку
 * первого со вторым такой же дешёвой, как четвёртого с пятым.
 */
export const PRIORITY_WEIGHT: Record<Priority, number> = { 1: 32, 2: 16, 3: 8, 4: 4, 5: 2, 6: 1 };

/**
 * Цена инверсии — разность весов участников: `W(min) − W(max)`. Целое, как
 * требует доказательство завершения локального поиска.
 *
 * Перестановка первого со вторым стоит 16, четвёртого с пятым — 2: ровно то
 * убывание, которое назвал владелец, но выведенное из свойства шкалы, а не
 * подобранное. Приоритет 1 инверсий не допускает вовсе (жёсткое H15), поэтому
 * его вес работает лишь как верхняя опора шкалы.
 */
export const inversionCost = (p: Priority, q: Priority): number =>
  Math.abs(PRIORITY_WEIGHT[Math.min(p, q) as Priority] - PRIORITY_WEIGHT[Math.max(p, q) as Priority]);

/**
 * **Спаренность** — 1…6, шкала владельца: 1 строго обязательно (0 %
 * неспаренности), 2 очень важно (20 %), 3 умеренно (40 %), 4 достаточно (60 %),
 * 5 необязательно (80 %), 6 запрещено (спаренных часов нет вовсе).
 */
export const PAIRING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type PairingLevel = (typeof PAIRING_LEVELS)[number];

export const PAIRING_TOLERANCE: Record<PairingLevel, number> = { 1: 0, 2: 0.2, 3: 0.4, 4: 0.6, 5: 0.8, 6: 0 };

export const PAIRING_TITLES: Record<PairingLevel, string> = {
  1: 'строго обязательно',
  2: 'очень важно',
  3: 'умеренно необходимо',
  4: 'достаточно',
  5: 'необязательно',
  6: 'запрещено',
};

/**
 * Спаренность **из приоритета не выводится** — решение владельца 2026-08-27:
 * шкалы не совпадают, уровень ставится вручную на предмет и не более того.
 * Прежняя связь «спаренность по умолчанию равна приоритету» была прочтением
 * автора спеки и вытеснена.
 *
 * Дефолт — 5 («необязательно», допуск 80 %): движок не навязывает спаривание
 * там, где школа его не просила, и не запрещает там, где оно сложилось само.
 */
export const DEFAULT_PAIRING: PairingLevel = 5;

/**
 * Спаренный блок — два часа предмета у класса в один день, занимающие смежные
 * позиции **либо позиции, разделённые большой переменой** (слова владельца:
 * «вполне допустимо, что пара может быть разделена пополам большой переменой»).
 */
export const pairingIsAdjacent = (slotA: number, slotB: number, bigBreakAfter: number): boolean =>
  Math.abs(slotA - slotB) === 1 || (Math.min(slotA, slotB) === bigBreakAfter && Math.abs(slotA - slotB) === 1);

/**
 * Запрет сдвоенных уроков касается **1-х классов**, а не всей начальной школы,
 * и имеет исключения — физкультура по лыжной подготовке и плаванию.
 * Проверено 2026-08-27 (базис #14); прежняя формулировка «в 1–4 классах
 * сдвоенных уроков нет» была ошибкой автора спеки, а не нормой.
 */
export const PAIRING_RESTRICTED_PARALLEL = 1;
export const PAIRING_RESTRICTION_EXCEPTIONS = ['лыжная подготовка', 'плавание'] as const;

// ─────────────────────────── скелет дня ───────────────────────────

/**
 * Скелет дня — сетка звонков, в которую расписание укладывается. Отдельный
 * блок, а не поля расписания.
 *
 * **Скелет привязан к ДНЯМ НЕДЕЛИ, а не только к параллелям.** В школах
 * понедельник и четверг обычно имеют своё расписание — линейка, классные часы,
 * — поэтому у них своя сетка клеток, а вторник, среда и пятница делят общую.
 * Четверг иногда совпадает с общим рядом, поэтому нужны две операции:
 * **обособить день** (выделить в собственный скелет) и **вернуть день в общий
 * ряд**. Параллели — второе измерение: если у младшей школы свой звонок, у неё
 * свой скелет на те же дни.
 */
export interface DaySkeleton {
  id: string;
  name: string;
  /** Дни недели, к которым скелет применён; 0 = понедельник. */
  days: number[];
  /** Параллели; пусто — скелет общий для всей школы. */
  parallels: number[];
  startTime: string;
  lessonMin: number;
  breakMin: number;
  bigBreakAfter: number;
  bigBreakMin: number;
  positions: number;
}

/**
 * Режим периода — **временный скелет на диапазон дат**, а не пересборка сетки.
 *
 * Так это устроено потому, что расписание внутри четверти держится неизменным
 * (AR-140): «щадящий режим перед каникулами» не вправе переставить уроки — он
 * вправе укоротить звонки. Уроки те же, в том же порядке, просто день короче.
 * Ровно так же нормативно устроен адаптационный период первых классов: это не
 * другое расписание, а другие звонки на сентябрь-октябрь.
 *
 * Что режим МОЖЕТ менять: длину урока, длину перемен, число позиций в дне,
 * время начала. Что НЕ может: нагрузку, приоритеты, спаренность, кто ведёт —
 * иначе он перестаёт быть режимом и становится второй сеткой.
 */
export interface SkeletonPeriod {
  id: string;
  name: string;
  /** Даты действия; вне их школа возвращается к обычному скелету сама. */
  from: string;
  to: string;
  /** Какой скелет действует в эти даты вместо обычного. */
  skeletonId: string;
  /** Параллели, которых режим касается; пусто — вся школа. */
  parallels: number[];
}

/** Обособить день: вынести его из общего скелета в собственный. */
export interface SkeletonSplit { fromSkeletonId: string; day: number; name: string }
/** Вернуть день в общий ряд: слить его скелет с названным. */
export interface SkeletonMerge { skeletonId: string; day: number; intoSkeletonId: string }

export const SKELETON_NORMS = {
  lessonMaxMin: 45,
  lessonMaxMinPrimary: 40,
  breakMinMin: 10,
  bigBreakMinMin: 20,
  bigBreakMaxMin: 30,
  source: 'СанПиН 1.2.3685-21 табл. 6.6',
} as const;

// ─────────────────────────── глубина поиска ───────────────────────────

/**
 * Глубина, а не секунды. Пять минут были названы условно: при жёстких
 * параметрах сетка собирается за доли секунды, при многих классах и мягких
 * требованиях — дольше. Работа измеряется вариантами и проверками качества.
 */
export const SEARCH_DEPTHS = {
  fast: { label: 'Быстрый', variants: 5, flatStop: 2 },
  normal: { label: 'Стандартный', variants: 30, flatStop: 3 },
  thorough: { label: 'Тщательный', variants: 200, flatStop: 6 },
} as const;
export type SearchDepth = keyof typeof SEARCH_DEPTHS;

/** Прогресс — модальное окно с анимацией. Ни одной цифры человеку не показывается. */
export const PROGRESS_SHOWS_NUMBERS = false;

/**
 * Недельная нагрузка педагога — **вывод**, и никто её не вводит. Вся цепочка
 * начинается от годовых часов предмета (решение владельца 2026-08-27: понятия
 * «полная ставка педагога» в системе пока нет):
 *
 *   годовые часы предмета → недельные часы предмета → недельная нагрузка
 *   педагога (сумма его пар «предмет × класс/группа») → норма отдыха
 *
 * Ни одно звено цепочки человек не набивает руками дважды.
 */
export const teacherWeekHours = (pairsWeekHours: readonly number[]): number =>
  pairsWeekHours.reduce((a, h) => a + h, 0);

/**
 * Минимум окон на отдых у педагога — **вывод**, а не константа.
 *
 * Завуч ставит одну величину в понятных ему единицах: **на сколько часов
 * нагрузки полагается одно окно отдыха**. Понятия ставки в расчёте нет вовсе —
 * норма считается от собственной нагрузки педагога, которая, в свою очередь,
 * посчитана от годовых часов его предметов:
 *
 *   окон(H) = round(H / часов-на-окно),  но не больше свободных слотов недели
 *
 * Пропорция, а не константа: приходящий педагог с четырьмя часами и предмет,
 * начинающийся в четвёртой четверти, не нуждаются в отдыхе того же объёма, что
 * педагог с восемнадцатью часами. Округление к БЛИЖАЙШЕМУ, а не вниз: вниз
 * систематически недодаёт — при одном окне на 6 часов педагог с 11 часами
 * получил бы одно окно вместо двух.
 *
 * **Обеденные окна в этот счёт не входят.** Обед — отдельное жёсткое требование
 * дня (H18); если засчитывать его как отдых, педагог с пятью обедами формально
 * «отдохнул» пять раз и не получил ни одного свободного окна сверх еды.
 */
export const restGapsFor = (hoursPerGap: number, teacherHours: number, freeSlotsInWeek: number): number => {
  if (hoursPerGap <= 0 || teacherHours <= 0) return 0;
  return Math.max(0, Math.min(Math.round(teacherHours / hoursPerGap), freeSlotsInWeek));
};

export const SCHEDULE_PARAMS: readonly ScheduleParam[] = [
  // ─── шаг 1 · нагрузка ───
  { id: 'load.yearHours', step: 'load', label: 'Часов в год', kind: 'input', status: 'new', control: 'number',
    min: 1, max: 1224, default: 102, feeds: ['load.weekHours'], refusals: ['PLAN_EXCEEDS_SANPIN'] },
  { id: 'load.weekHours', step: 'load', label: 'Часов в неделю', kind: 'derived', status: 'present', control: 'readonly',
    min: 0, max: 42, feeds: ['H1', 'единицы планирования'],
    refusals: ['LOAD_EXCEEDS_SANPIN', 'LOAD_EXCEEDS_GRID'] },
  { id: 'load.teacher', step: 'load', label: 'Кто ведёт', kind: 'input', status: 'present', control: 'select',
    feeds: ['H2'], refusals: ['SUBJECT_UNCOVERED'] },
  { id: 'load.scope', step: 'load', label: 'Ведётся', kind: 'input', status: 'present', control: 'segment',
    values: ['class', 'group'], default: 'class', feeds: ['H3', 'H4'],
    refusals: ['GROUPS_UNASSIGNED', 'GROUP_HOURS_UNEQUAL'] },

  // ─── шаг 2 · приоритет ───
  { id: 'subject.priority', step: 'priority', label: 'Приоритет', kind: 'input', status: 'new', control: 'select',
    values: PRIORITIES, default: 3, feeds: ['H15', 'маркер order'], refusals: ['PRIORITY_START_OVERFLOW'] },

  // ─── шаг 3 · спаренность ───
  { id: 'subject.pairing', step: 'pairing', label: 'Спаренность', kind: 'input', status: 'new', control: 'select',
    values: PAIRING_LEVELS, default: DEFAULT_PAIRING, feeds: ['H16', 'маркер pairing'],
    refusals: ['PAIRING_HOURS_ODD', 'PAIRING_FORBIDDEN_FIRST_GRADE'] },

  // ─── шаг 4 · педагоги ───
  { id: 'teacher.methodDay', step: 'teacher', label: 'Методический день', kind: 'input', status: 'new', control: 'select',
    feeds: ['H12'], refusals: ['TEACHER_TIME_SHORT'] },
  { id: 'method.group.members', step: 'teacher', label: 'Методическое объединение: состав', kind: 'input', status: 'new', control: 'multiselect',
    feeds: ['H17'], refusals: ['METHOD_GROUP_NO_WINDOW'] },
  { id: 'method.group.slot', step: 'teacher', label: 'Методическое объединение: когда', kind: 'input', status: 'new', control: 'grid',
    feeds: ['H17'], refusals: ['METHOD_GROUP_NO_WINDOW'] },
  { id: 'teacher.lunchAfterLessons', step: 'teacher', label: 'Обед обязателен, если уроков в день от', kind: 'input', status: 'new', control: 'number',
    min: 3, max: 7, default: 5, feeds: ['H18'], refusals: ['TEACHER_LUNCH_IMPOSSIBLE'] },
  { id: 'teacher.lunchSlots', step: 'teacher', label: 'Длина обеда', kind: 'input', status: 'new', control: 'number',
    min: 1, max: 2, default: 1, feeds: ['H18'], refusals: ['TEACHER_LUNCH_IMPOSSIBLE'] },
  { id: 'rest.hoursPerGap', step: 'teacher', label: 'Одно окно отдыха на каждые ... часов нагрузки', kind: 'input', status: 'new', control: 'number',
    min: 1, max: 40, feeds: ['teacher.minWeekGaps'] },
  { id: 'teacher.weekHours', step: 'teacher', label: 'Нагрузка педагога, часов в неделю', kind: 'derived', status: 'new', control: 'readonly',
    min: 0, feeds: ['teacher.minWeekGaps', 'H12', 'H13'] },
  { id: 'teacher.minWeekGaps', step: 'teacher', label: 'Окон в неделю на отдых, не менее', kind: 'derived', status: 'new', control: 'readonly',
    min: 0, feeds: ['маркер teacherRest'] },
  { id: 'teacher.maxPerDay', step: 'teacher', label: 'Уроков в день не больше', kind: 'input', status: 'new', control: 'number',
    min: 1, max: 8, feeds: ['H13'], refusals: ['TEACHER_TIME_SHORT'] },
  { id: 'teacher.unavailable', step: 'teacher', label: 'Недоступные уроки', kind: 'input', status: 'slot', control: 'grid',
    feeds: ['H12'] },

  // ─── шаг 5 · глубина поиска ───
  { id: 'search.depth', step: 'search', label: 'Насколько тщательно искать', kind: 'input', status: 'new', control: 'segment',
    values: ['fast', 'normal', 'thorough'], default: 'normal', feeds: ['число вариантов', 'число проверок качества'] },
  { id: 'search.variants', step: 'search', label: 'Вариантов собрать', kind: 'derived', status: 'new', control: 'readonly',
    min: 1, feeds: ['мультистарт'] },
  { id: 'search.qualityChecks', step: 'search', label: 'Проверок качества', kind: 'derived', status: 'new', control: 'readonly',
    min: 1, feeds: ['локальный спуск'] },
  { id: 'search.stopWhenFlat', step: 'search', label: 'Остановиться, если не улучшается', kind: 'derived', status: 'new', control: 'readonly',
    min: 1, feeds: ['ранняя остановка'] },
  { id: 'search.seed', step: 'search', label: 'Зерно перебора', kind: 'input', status: 'present', control: 'number',
    min: 1, feeds: ['воспроизводимость'] },
] as const;

/**
 * Отказа «нет решения» не существует (AR-136). Дети не могут остаться без
 * уроков, поэтому ответ «не собралось» без причины запрещён: у любого отказа
 * есть адрес и имя, и он называет, что поправить.
 *
 * Ступень 1 — арифметика до перебора (коды ниже).
 * Ступень 2 — диагностика релаксацией: движок по одному снимает снимаемые
 *   требования и называет то, чьё снятие собрало сетку (`RELAXATION_SUGGESTED`).
 * Ступень 3 — упор в норму: `PLAN_OR_CALENDAR_INVALID` с разбором.
 */
export const SCHEDULE_REFUSALS = [
  'CALENDAR_NOT_READY',
  'PLAN_EXCEEDS_SANPIN',
  'LOAD_EXCEEDS_SANPIN',
  'LOAD_EXCEEDS_GRID',
  'SUBJECT_UNCOVERED',
  'GROUPS_UNASSIGNED',
  'GROUP_HOURS_UNEQUAL',
  'TEACHER_TIME_SHORT',
  'TEACHER_LUNCH_IMPOSSIBLE',
  'METHOD_GROUP_NO_WINDOW',
  'PRIORITY_START_OVERFLOW',
  'PAIRING_HOURS_ODD',
  'PAIRING_FORBIDDEN_FIRST_GRADE',
  'SKELETON_TOO_SHORT',
  'RELAXATION_SUGGESTED',
  'PLAN_OR_CALENDAR_INVALID',
] as const;
export type ScheduleRefusal = (typeof SCHEDULE_REFUSALS)[number];

/** Требования, которые диагностика вправе снять на ступени 2. Порядок — порядок снятия. */
export const RELAXABLE = [
  'subject.pairing',
  'subject.priority',
  'teacher.maxPerDay',
  'rest.hoursPerGap',
  'teacher.methodDay',
] as const;

export const SCHEDULE_REFUSAL_TEXTS: Record<ScheduleRefusal, string> = {
  CALENDAR_NOT_READY: 'Календарь не настроен: не заданы учебные периоды {year}.',
  PLAN_EXCEEDS_SANPIN: '{class}: по учебному плану {total} ч в неделю при норме {cap} — нарушение СанПиН.',
  LOAD_EXCEEDS_SANPIN: '{class}: {total} ч в неделю при норме {cap} — нарушение СанПиН.',
  LOAD_EXCEEDS_GRID: '{class}: {total} ч не помещаются в {days} дней × {perDay} уроков.',
  SUBJECT_UNCOVERED: '{subject} в {class}: не назначен педагог{groups}.',
  GROUPS_UNASSIGNED: '{class}: группы объявлены, состав не назначен.',
  GROUP_HOURS_UNEQUAL: '{subject} в {class}: часы групп не равны ({hours}).',
  TEACHER_TIME_SHORT: '{teacher}: {hours} ч при {available} доступных уроках — методический день и обед оставляют меньше места, чем нагрузка.',
  TEACHER_LUNCH_IMPOSSIBLE: '{teacher}: {lessons} уроков в день без места под обеденный перерыв.',
  METHOD_GROUP_NO_WINDOW: 'Методическое объединение «{group}»: {teacher} ведёт урок в это время.',
  PRIORITY_START_OVERFLOW: '{class}: часов первого приоритета {count} — они не помещаются в начала {days} учебных дней.',
  PAIRING_HOURS_ODD: '{subject}, {class}: спаренность обязательна, но часов нечётное число ({hours}).',
  PAIRING_FORBIDDEN_FIRST_GRADE: '{subject}, {class}: сдвоенные уроки в 1-х классах не проводятся, кроме физкультуры по лыжной подготовке и плаванию.',
  SKELETON_TOO_SHORT: 'Скелет «{skeleton}»: {positions} позиций при потребности {needed}.',
  RELAXATION_SUGGESTED: 'Расписание собирается, если {action}. Сделать?',
  PLAN_OR_CALENDAR_INVALID: 'Расписание не собирается при текущем учебном плане: {detail}.',
};

/** Состояния асинхронной задачи генерации (AR-130). */
export const GENERATION_JOB_STATES = ['queued', 'running', 'done', 'refused', 'cancelled'] as const;
export type GenerationJobState = (typeof GENERATION_JOB_STATES)[number];

export interface GenerationJobDto {
  jobId: string;
  state: GenerationJobState;
  templateId?: string;
  refusal?: { code: ScheduleRefusal; details: Record<string, unknown> };
  /**
   * Служебные счётчики: пишутся в аудит и в отладку, но НЕ показываются
   * человеку. Экран генерации — модалка с анимацией, без единой цифры.
   */
  debug?: { variantsDone: number; variantsPlanned: number; bestPenalty: number };
}
