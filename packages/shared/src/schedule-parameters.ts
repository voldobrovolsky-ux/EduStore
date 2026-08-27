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

// ─────────────────────────── ранги ───────────────────────────

/**
 * Приоритет предмета — ранг 1…6, задающий порядок уроков внутри дня класса.
 * Ранг 1 жёсткий: ни один урок другого ранга не стоит раньше него в том же дне.
 * Ранги 2…5 мягкие: смешение соседних допускается долей `PRIORITY_TOLERANCE`.
 *
 * Свойство, которое стоит знать заранее: порядок внутри дня почти всегда
 * достижим — перестановка уроков в одном дне не меняет ни одной суммы и задевает
 * только занятость педагогов. Приоритет крайне редко делает задачу неразрешимой.
 */
export const PRIORITY_RANKS = [1, 2, 3, 4, 5, 6] as const;
export type PriorityRank = (typeof PRIORITY_RANKS)[number];

/** Допустимая доля инверсий по рангу — регрессия. Величины `[дефолт]`, вопрос В9. */
export const PRIORITY_TOLERANCE: Record<PriorityRank, number> = { 1: 0, 2: 0.2, 3: 0.3, 4: 0.4, 5: 0.5, 6: 1 };

/**
 * Спаренность — ранг 1…6. Сдвоенный и одиночный урок равноправны как формы;
 * ранг говорит, насколько предмет тяготеет к спариванию.
 * Значение — допустимая доля НЕспаренных часов; ранг 6 запрещает спаривание вовсе.
 */
export const PAIRING_RANKS = [1, 2, 3, 4, 5, 6] as const;
export type PairingRank = (typeof PAIRING_RANKS)[number];

export const PAIRING_TOLERANCE: Record<PairingRank, number> = { 1: 0, 2: 0.2, 3: 0.4, 4: 0.6, 5: 0.8, 6: 0 };

export const PAIRING_TITLES: Record<PairingRank, string> = {
  1: 'строго обязательно',
  2: 'очень важно',
  3: 'умеренно необходимо',
  4: 'достаточно',
  5: 'необязательно',
  6: 'запрещено',
};

/** Ранг 1 недоступен для 1–4 параллелей: сдвоенных уроков в начальной школе нет. */
export const PAIRING_RANK1_MIN_PARALLEL = 5;

// ─────────────────────────── скелет дня ───────────────────────────

/**
 * Скелет дня — сетка звонков, в которую расписание укладывается. Отдельный
 * блок, а не поля расписания: скелетов бывает больше одного (начальная школа с
 * уроком 35–40 минут и старшая с 45 — два звонковых расписания), скелет нужен
 * журналу и печати, и меняется он раз в год против ежечетвертной нагрузки.
 * Норма первого класса живёт ЗДЕСЬ, а не среди параметров расписания.
 */
export interface DaySkeleton {
  id: string;
  name: string;
  /** Параллели, к которым скелет применяется. */
  appliesTo: number[];
  startTime: string;
  lessonMin: number;
  breakMin: number;
  bigBreakAfter: number;
  bigBreakMin: number;
  positions: number;
}

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
  { id: 'subject.priorityRank', step: 'priority', label: 'Приоритет', kind: 'input', status: 'new', control: 'select',
    values: PRIORITY_RANKS, default: 3, feeds: ['H15', 'маркер order'], refusals: ['PRIORITY_RANK1_OVERFLOW'] },

  // ─── шаг 3 · спаренность ───
  { id: 'subject.pairingRank', step: 'pairing', label: 'Спаренность', kind: 'input', status: 'new', control: 'select',
    values: PAIRING_RANKS, default: 5, feeds: ['H16', 'маркер pairing'],
    refusals: ['PAIRING_HOURS_ODD', 'PAIRING_FORBIDDEN_IN_PRIMARY'] },

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
  { id: 'teacher.minWeekGaps', step: 'teacher', label: 'Окон в неделю на отдых, не менее', kind: 'input', status: 'new', control: 'number',
    min: 0, max: 10, default: 2, feeds: ['маркер teacherRest'] },
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
  'PRIORITY_RANK1_OVERFLOW',
  'PAIRING_HOURS_ODD',
  'PAIRING_FORBIDDEN_IN_PRIMARY',
  'SKELETON_TOO_SHORT',
  'RELAXATION_SUGGESTED',
  'PLAN_OR_CALENDAR_INVALID',
] as const;
export type ScheduleRefusal = (typeof SCHEDULE_REFUSALS)[number];

/** Требования, которые диагностика вправе снять на ступени 2. Порядок — порядок снятия. */
export const RELAXABLE = [
  'subject.pairingRank',
  'subject.priorityRank',
  'teacher.maxPerDay',
  'teacher.minWeekGaps',
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
  PRIORITY_RANK1_OVERFLOW: '{class}: предметов первого приоритета {count} при {days} учебных днях — первым уроком все не встанут.',
  PAIRING_HOURS_ODD: '{subject}, {class}: спаренность обязательна, но часов нечётное число ({hours}).',
  PAIRING_FORBIDDEN_IN_PRIMARY: '{subject}, {class}: сдвоенные уроки в 1–4 классах не проводятся — СанПиН 1.2.3685-21.',
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
