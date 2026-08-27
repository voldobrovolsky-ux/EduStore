/**
 * Реестр параметров расписания — один источник для экранов и для генератора.
 *
 * Документ: `specs/schedule-block/35-parameters.md`. Решения: AR-129…AR-132.
 * Полнота реестра доказывается воротами **G-61**: у каждого параметра есть
 * область, дефолт внутри неё и названный потребитель; каждый вход генератора
 * покрыт параметром; ни один параметр ввода не ослабляет норму.
 *
 * Реестр существует потому, что список параметров прозой расходится с кодом
 * молча. Версия 1.1.1 наступила на это дважды: четыре временных параметра
 * собирались экраном и не влияли ни на один выход (AR-103), а «уроков в день» —
 * обязательный вход двух арифметических отказов — не собирались вовсе.
 */

/** Шаги мастера настройки расписания. Порядок — порядок экранов. */
export const PARAM_STEPS = [
  { no: 1, id: 'year', title: 'Учебный год и периоды' },
  { no: 2, id: 'week', title: 'Ритм недели и дня' },
  { no: 3, id: 'load', title: 'Нагрузка' },
  { no: 4, id: 'subject', title: 'Правила предмета' },
  { no: 5, id: 'teacher', title: 'Предпочтения педагога' },
  { no: 6, id: 'quality', title: 'Профиль качества' },
  { no: 7, id: 'budget', title: 'Бюджет генерации' },
] as const;
export type ParamStep = (typeof PARAM_STEPS)[number]['id'];

/**
 * Природа параметра. Смешение природ — источник правок, которые школа делает
 * там, где правка бессмысленна:
 *   input   — задаёт модератор;
 *   norm    — задаёт закон, в коде константой; ужесточить можно, ослабить нет;
 *   derived — вычисляет движок, ввода не существует.
 */
export type ParamKind = 'input' | 'norm' | 'derived';

/** Есть в коде · вводится этим реестром · объявлен и выключен в версии. */
export type ParamStatus = 'present' | 'new' | 'slot';

export type ParamControl =
  | 'number'
  | 'time'
  | 'date'
  | 'segment'
  | 'select'
  | 'multiselect'
  | 'toggle'
  | 'slider'
  | 'grid'
  | 'text';

export interface ScheduleParam {
  id: string;
  step: ParamStep;
  /** Подпись в интерфейсе — та же строка, что видит модератор. */
  label: string;
  kind: ParamKind;
  status: ParamStatus;
  control: ParamControl;
  /** Числовая область; для нечисловых — перечень допустимых значений. */
  min?: number;
  max?: number;
  values?: readonly (string | number)[];
  default?: string | number | boolean;
  /**
   * Верхняя граница, заданная НОРМОЙ. Параметр ввода не вправе её превысить:
   * `max <= normCap` проверяется воротами, а не доверием к автору экрана.
   */
  normCap?: number;
  /** Источник нормы — печатается в тексте отказа. */
  normSource?: string;
  /**
   * Кто потребляет значение: жёсткое ограничение (`H1`…`H14`), маркер качества
   * либо проекция выдачи. Параметр без потребителя — мёртвый ввод.
   */
  feeds: readonly string[];
  /** Коды отказа, которые этот параметр способен вызвать. */
  refusals?: readonly string[];
}

/** Значение по умолчанию «половина дня» вычисляется из `day.slotsPerDay`. */
export const DEFAULT_EARLY_HALF = (slotsPerDay: number): number => Math.ceil(slotsPerDay / 2);

export const SCHEDULE_PARAMS: readonly ScheduleParam[] = [
  // ─── шаг 1 · учебный год ───
  { id: 'year.academicYear', step: 'year', label: 'Учебный год', kind: 'input', status: 'present', control: 'select',
    feeds: ['материализация', 'EXDATE календаря'], refusals: ['CALENDAR_YEAR_MISSING'] },
  { id: 'year.periodKind', step: 'year', label: 'Деление года', kind: 'input', status: 'present', control: 'segment',
    values: ['quarters', 'trimesters', 'halves'], default: 'quarters', feeds: ['границы материализации'] },
  { id: 'year.period.from', step: 'year', label: 'Начало периода', kind: 'input', status: 'present', control: 'date',
    feeds: ['материализация'], refusals: ['TERM_REVERSED'] },
  { id: 'year.period.to', step: 'year', label: 'Конец периода', kind: 'input', status: 'present', control: 'date',
    feeds: ['материализация'], refusals: ['TERM_OVERLAP', 'TERM_REVERSED'] },
  { id: 'year.exceptionDays', step: 'year', label: 'Дни-исключения', kind: 'input', status: 'slot', control: 'multiselect',
    feeds: ['пропуск дня при материализации'] },

  // ─── шаг 2 · ритм недели и дня ───
  { id: 'week.days', step: 'week', label: 'Учебных дней в неделю', kind: 'input', status: 'present', control: 'segment',
    values: [5, 6], default: 5, feeds: ['слоты недели', 'Л2', 'Л3'] },
  { id: 'week.saturdaySlots', step: 'week', label: 'Уроков в субботу', kind: 'input', status: 'new', control: 'number',
    min: 0, max: 7, default: 4, feeds: ['H6'], refusals: ['LOAD_EXCEEDS_GRID'] },
  { id: 'day.slotsPerDay', step: 'week', label: 'Уроков в день (верхняя граница)', kind: 'input', status: 'present', control: 'number',
    min: 1, max: 7, normCap: 7, normSource: 'СанПиН 1.2.3685-21 табл. 6.6', default: 6,
    feeds: ['H6', 'Л2', 'Л3', 'Л7'], refusals: ['DAY_EXCEEDS_SANPIN'] },
  { id: 'day.startTime', step: 'week', label: 'Начало первого урока', kind: 'input', status: 'new', control: 'time',
    default: '08:30', feeds: ['печать', 'ICS', 'гейт «текущий урок»'] },
  { id: 'day.lessonMin', step: 'week', label: 'Длина урока', kind: 'input', status: 'present', control: 'number',
    min: 30, max: 45, normCap: 45, normSource: 'СанПиН 1.2.3685-21 табл. 6.6', default: 45, feeds: ['H7'] },
  { id: 'day.lessonMinFirstGrade', step: 'week', label: 'Длина урока в 1-й параллели', kind: 'input', status: 'new', control: 'number',
    min: 30, max: 40, normCap: 40, normSource: 'СанПиН 1.2.3685-21 табл. 6.6', default: 35, feeds: ['H7'] },
  { id: 'day.breakMin', step: 'week', label: 'Длина перемены', kind: 'input', status: 'present', control: 'number',
    min: 10, max: 30, default: 10, feeds: ['H7'] },
  { id: 'day.bigBreakAfter', step: 'week', label: 'Большая перемена после урока', kind: 'input', status: 'present', control: 'segment',
    values: [2, 3], default: 2, feeds: ['H7'] },
  { id: 'day.bigBreakMin', step: 'week', label: 'Длина большой перемены', kind: 'input', status: 'present', control: 'number',
    min: 20, max: 30, default: 20, feeds: ['H7'] },
  { id: 'day.maxMinutes', step: 'week', label: 'Потолок длины учебного дня', kind: 'input', status: 'new', control: 'number',
    min: 240, max: 420, default: 420, feeds: ['H7'], refusals: ['DAY_TOO_LONG'] },

  // ─── шаг 3 · нагрузка ───
  { id: 'load.hours', step: 'load', label: 'Часов в неделю', kind: 'input', status: 'present', control: 'number',
    min: 0, max: 42, default: 0, feeds: ['H1', 'единицы планирования'],
    refusals: ['LOAD_EXCEEDS_SANPIN', 'LOAD_EXCEEDS_GRID', 'TEACHER_OVERBOOKED', 'GROUP_HOURS_UNEQUAL'] },
  { id: 'load.scope', step: 'load', label: 'Ведётся', kind: 'input', status: 'present', control: 'segment',
    values: ['class', 'group'], default: 'class', feeds: ['H3', 'H4'],
    refusals: ['SUBJECT_UNCOVERED', 'GROUPS_UNASSIGNED'] },

  // ─── шаг 4 · правила предмета ───
  { id: 'subject.priority', step: 'subject', label: 'Ставить в начало дня', kind: 'input', status: 'present', control: 'toggle',
    default: false, feeds: ['маркер prio', 'маркер firstLast'] },
  { id: 'subject.maxPerDay', step: 'subject', label: 'Часов в день не больше', kind: 'input', status: 'new', control: 'number',
    min: 1, max: 2, default: 1, feeds: ['H8'], refusals: ['SUBJECT_MAX_PER_DAY_UNREACHABLE'] },
  { id: 'subject.paired', step: 'subject', label: 'Сдвоенные уроки', kind: 'input', status: 'new', control: 'segment',
    values: ['forbidden', 'allowed', 'required'], default: 'forbidden', feeds: ['H9', 'единица планирования'],
    refusals: ['PAIRED_HOURS_ODD', 'PAIRED_FORBIDDEN_IN_PRIMARY'] },
  { id: 'subject.notFirst', step: 'subject', label: 'Не ставить первым уроком', kind: 'input', status: 'new', control: 'toggle',
    default: false, feeds: ['H10'], refusals: ['SUBJECT_POSITION_IMPOSSIBLE'] },
  { id: 'subject.notLast', step: 'subject', label: 'Не ставить последним уроком', kind: 'input', status: 'new', control: 'toggle',
    default: false, feeds: ['H10'], refusals: ['SUBJECT_POSITION_IMPOSSIBLE'] },
  { id: 'subject.preferredDays', step: 'subject', label: 'Предпочтительные дни', kind: 'input', status: 'new', control: 'multiselect',
    feeds: ['маркер subjectDays'] },
  { id: 'subject.groupEdgeHard', step: 'subject', label: 'Групповой час только на краю дня', kind: 'input', status: 'new', control: 'toggle',
    default: false, feeds: ['H11', 'маркер groupEdge'], refusals: ['GROUP_EDGE_UNREACHABLE'] },

  // ─── шаг 5 · предпочтения педагога ───
  { id: 'teacher.methodDay', step: 'teacher', label: 'Методический день', kind: 'input', status: 'new', control: 'select',
    feeds: ['H12'], refusals: ['TEACHER_UNAVAILABLE_OVERBOOKED'] },
  { id: 'teacher.unavailable', step: 'teacher', label: 'Недоступные уроки', kind: 'input', status: 'new', control: 'grid',
    feeds: ['H12'], refusals: ['TEACHER_UNAVAILABLE_OVERBOOKED'] },
  { id: 'teacher.maxPerDay', step: 'teacher', label: 'Уроков в день не больше', kind: 'input', status: 'new', control: 'number',
    min: 1, max: 7, feeds: ['H13'], refusals: ['TEACHER_MAX_PER_DAY_UNREACHABLE'] },
  { id: 'teacher.noGaps', step: 'teacher', label: 'Без окон (жёстко)', kind: 'input', status: 'new', control: 'toggle',
    default: false, feeds: ['H14', 'маркер teacherGap'], refusals: ['TEACHER_NO_GAPS_UNREACHABLE'] },
  { id: 'teacher.preferHalf', step: 'teacher', label: 'Предпочитает', kind: 'input', status: 'new', control: 'segment',
    values: ['early', 'late', 'none'], default: 'none', feeds: ['маркер teacherHalf'] },

  // ─── шаг 6 · профиль качества ───
  { id: 'quality.profile', step: 'quality', label: 'Что важнее', kind: 'input', status: 'new', control: 'select',
    values: ['children', 'teachers', 'even', 'custom'], default: 'children', feeds: ['веса маркеров'] },
  { id: 'quality.weight', step: 'quality', label: 'Вес маркера', kind: 'input', status: 'new', control: 'slider',
    min: 0, max: 10, feeds: ['целевая функция Π'] },
  { id: 'quality.earlyHalf', step: 'quality', label: 'Сколько первых уроков считать началом дня', kind: 'input', status: 'new', control: 'number',
    min: 1, max: 7, default: 3, feeds: ['маркер prio'] },
  { id: 'quality.keepCurrent', step: 'quality', label: 'Беречь действующее расписание', kind: 'input', status: 'new', control: 'toggle',
    default: true, feeds: ['маркер stability'] },

  // ─── шаг 7 · бюджет ───
  { id: 'budget.seconds', step: 'budget', label: 'Сколько искать', kind: 'input', status: 'new', control: 'segment',
    values: [30, 120, 300], default: 120, feeds: ['число перезапусков', 'глубина спуска'], refusals: ['NO_SOLUTION'] },
  { id: 'budget.seed', step: 'budget', label: 'Зерно перебора', kind: 'input', status: 'present', control: 'number',
    min: 1, feeds: ['воспроизводимость'] },
] as const;

/**
 * Пресеты профиля качества (вопрос В5 владельцу). Ключи — маркеры качества;
 * пресет «custom» значений не несёт: он открывает ползунки.
 */
export const QUALITY_PROFILES = {
  children: { prio: 10, teacherGap: 4, subjectSpread: 8, dayBalance: 7, stability: 4, teacherBalance: 2, groupEdge: 2, firstLast: 5 },
  teachers: { prio: 5, teacherGap: 10, subjectSpread: 4, dayBalance: 4, stability: 4, teacherBalance: 8, groupEdge: 3, firstLast: 2 },
  even: { prio: 8, teacherGap: 7, subjectSpread: 6, dayBalance: 5, stability: 4, teacherBalance: 3, groupEdge: 2, firstLast: 2 },
} as const;

/** Допустимые значения бюджета генерации в секундах (AR-129). */
export const GENERATION_BUDGETS = [30, 120, 300] as const;
export type GenerationBudget = (typeof GENERATION_BUDGETS)[number];

/**
 * Число перезапусков — ВЫВОД, а не ввод: движок делит бюджет на замер одного
 * цикла «генерация + спуск». Просить у модератора число перезапусков значило бы
 * просить величину, смысла которой он знать не обязан.
 */
export const plannedRestarts = (budgetSeconds: number, cycleMs: number): number =>
  Math.max(1, Math.floor((budgetSeconds * 1000) / Math.max(1, cycleMs)));

/** Состояния асинхронной задачи генерации (AR-130). */
export const GENERATION_JOB_STATES = ['queued', 'running', 'done', 'refused', 'cancelled'] as const;
export type GenerationJobState = (typeof GENERATION_JOB_STATES)[number];

export interface GenerationJobDto {
  jobId: string;
  state: GenerationJobState;
  /** Прогресс показывает работу, а не спиннер: молчащие 5 минут читаются как зависание. */
  restartsDone: number;
  restartsPlanned: number;
  bestPenalty?: number;
  bestAggregate?: number;
  templateId?: string;
  refusal?: { code: string; details: Record<string, unknown> };
}
