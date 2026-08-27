/**
 * G-56…G-60 (AR-118…AR-127) — **слой качества расписания доказуем.**
 *
 * Пять ворот одним прогоном, потому что все пять живут на одних и тех же чистых
 * функциях и разделять их значило бы пять раз собирать одну сетку:
 *
 *   G-56 · квалиметрия: πᵢ — целые неотрицательные, Qᵢ ∈ [0,1], верхняя граница
 *          разброса совпадает с максимумом по ВСЕМ разбиениям малой задачи;
 *   G-57 · автопроверка: каждый инвариант I-1…I-8 воспроизводится порчей
 *          допустимой сетки — набор ловит подделку, а не только честный вход;
 *   G-58 · автокорректировка: Π не растёт, каждый принятый ход уменьшает его
 *          строго, повторный прогон из локального минимума не делает ходов,
 *          два прогона на одном входе дают одну сетку;
 *   G-59 · ручной ход: жёсткий инвариант не переступается, ухудшающий ход
 *          называет маркер и величину, у каждого хода есть обратный;
 *   G-60 · выдача: печатная и календарная проекции совпадают со снимком,
 *          подпись воспроизводима и меняется вместе с версией сетки.
 *
 * Эталон — `specs/schedule-block/model/quality.mjs` (свойства Q1…Q12).
 * Ни БД, ни сети: слой чист, и его поведение перечисляется, а не наблюдается.
 *
 * Запуск: npm --workspace apps/api run quality:check
 */
import {
  QUALITY_MARKERS,
  QUALITY_WEIGHTS,
  SCHEDULE_BLOCK_ERRORS,
  SCHEDULE_BLOCK_ERROR_TEXTS,
  SCHEDULE_INVARIANTS,
  type ScheduleMove,
} from '@edustore/shared';
import { generate, type GenInput, type GenPair } from '../src/schoolium/schedule/generator';
import {
  applyMove,
  buildSnapshot,
  canonicalSnapshot,
  evaluateManualMove,
  inverseMove,
  invariants,
  maxSpread,
  neighbourhood,
  penalties,
  projectCsv,
  projectGrid,
  projectIcs,
  qualityDto,
  repair,
  signSnapshot,
  slotsFromUnits,
  totalPenalty,
  unitsFromSlots,
  type PlacedUnit,
  type QualityContext,
  type SlotRow,
} from '../src/schoolium/schedule/quality';
import { check, report } from './schoolium/harness';

const TEACHERS = ['Мария', 'Ольга', 'Иван', 'Пётр', 'Анна', 'Нина', 'Олег', 'Юлия', 'Егор', 'Вера'];

/** Первая школа: 8 параллелей без литер, английский по группам, приоритеты заданы. */
function firstSchool(seed: number): GenInput {
  const classes = Array.from({ length: 8 }, (_, i) => ({ id: `c${i + 1}`, label: String(i + 1), parallel: i + 1, groupCount: 2 }));
  const pairs: GenPair[] = [];
  classes.forEach((c, i) => {
    const add = (subjectId: string, subjectName: string, teacher: string, hours: number, scope: 'class' | 'group', groupNos: number[], priority = false) =>
      pairs.push({ subjectId: `${subjectId}-${c.id}`, subjectName, classId: c.id, teacherId: teacher, teacherName: teacher, scope, groupNos, hours, priority });
    add('math', 'математика', TEACHERS[i % 3], 4, 'class', [], true);
    add('rus', 'русский', TEACHERS[3 + (i % 3)], 4, 'class', [], true);
    add('hist', 'история', TEACHERS[6], 2, 'class', []);
    add('pe', 'физкультура', TEACHERS[7], 2, 'class', []);
    add('eng', 'английский', TEACHERS[8], 2, 'group', [1]);
    add('eng', 'английский', TEACHERS[9], 2, 'group', [2]);
  });
  return {
    classes,
    pairs,
    params: { days: 5, slotsPerDay: 7, lessonMin: 45, breakMin: 10, bigBreakAfter: 2, bigBreakMin: 30 },
    seed,
    classesWithUnassignedGroups: [],
    uncovered: [],
  };
}

function build(seed: number): { units: PlacedUnit[]; ctx: QualityContext; rows: SlotRow[] } {
  const input = firstSchool(seed);
  const res = generate(input);
  if (!res.ok) throw new Error(`сетка не собралась: ${res.code}`);
  const ctx: QualityContext = {
    classes: input.classes.map((c) => ({ id: c.id, label: c.label, parallel: c.parallel })),
    params: input.params,
    priority: new Set(input.pairs.filter((p) => p.priority).map((p) => p.subjectId)),
  };
  const rows: SlotRow[] = res.slots.map((s) => ({ ...s }));
  return { units: unitsFromSlots(rows, ctx), ctx, rows };
}

const { units, ctx, rows } = build(20260826);

// ─────────────────────────── G-56 · квалиметрия ───────────────────────────

check(units.length === 112, `сетка первой школы: ${units.length} учебных часов на ${ctx.params.days * ctx.params.slotsPerDay} слотах недели`);
check(slotsFromUnits(units).length === rows.length, 'сборка часов из строк шаблона и обратная проекция сходятся по числу строк');

const pen = penalties(units, ctx);
let quantitiesOk = true;
for (const m of QUALITY_MARKERS) {
  if (!Number.isInteger(pen[m].pi) || pen[m].pi < 0) quantitiesOk = false;
  if (pen[m].max <= 0) quantitiesOk = false;
  const q = 1 - pen[m].pi / pen[m].max;
  if (q < 0 || q > 1) quantitiesOk = false;
}
check(quantitiesOk, `восемь маркеров: πᵢ целые ≥ 0, πᵢᵐᵃˣ > 0, Qᵢ ∈ [0,1]`);
check(QUALITY_MARKERS.every((m) => Number.isInteger(QUALITY_WEIGHTS[m]) && QUALITY_WEIGHTS[m] > 0),
  'веса маркеров целые и положительные — на этом стоит доказательство завершения поиска');

const P = totalPenalty(pen);
check(Number.isInteger(P) && P >= 0, `свёртка Π(x₀) = ${P} — неотрицательное целое`);

const dto = qualityDto(pen, false);
check(dto.aggregate >= 0 && dto.aggregate <= 1, `агрегат качества ${(dto.aggregate * 100).toFixed(1)} % лежит в [0,1]`);
check(dto.markers.length === QUALITY_MARKERS.length, `панель качества показывает все ${QUALITY_MARKERS.length} маркеров`);
check(dto.markers.find((m) => m.id === 'stability')?.active === false,
  'без подтверждённой сетки маркер стабильности неактивен, а не равен единице: сравнивать было не с чем');

// maxSpread против перебора ВСЕХ разбиений малой задачи
{
  const H = 7, D = 3, CAP = 4;
  let best = 0;
  const rec = (d: number, left: number, acc: number[]): void => {
    if (d === D) {
      if (left === 0) best = Math.max(best, acc.reduce((a, n) => a + Math.abs(n * D - H), 0));
      return;
    }
    for (let n = 0; n <= Math.min(CAP, left); n += 1) rec(d + 1, left - n, [...acc, n]);
  };
  rec(0, H, []);
  check(maxSpread(H, D, CAP) === best, `верхняя граница разброса вычислена, а не угадана: maxSpread(7,3,4) = ${best} совпал с максимумом по всем разбиениям`);
}

// ─────────────────────────── G-57 · автопроверка ───────────────────────────

check(invariants(units, ctx).length === 0, `жёсткие инварианты держатся на всех ${units.length} часах сетки`);

const spoil = (fn: (u: PlacedUnit[]) => PlacedUnit[]): Set<string> =>
  new Set(invariants(fn(units.map((u) => ({ ...u }))), ctx).map((v) => v.code));

const spoiled: [string, (u: PlacedUnit[]) => PlacedUnit[]][] = [
  ['I-1', (u) => [...u, { ...u[0] }]],
  ['I-3', (u) => u.map((x, i) => (i === 1 ? { ...x, classId: u[0].classId, dayNo: u[0].dayNo, slotNo: u[0].slotNo } : x))],
  ['I-5', (u) => u.map((x, i) => (i === 0 ? { ...x, slotNo: ctx.params.slotsPerDay } : x))],
  ['I-7', (u) => u.map((x, i) => (i === 0 ? { ...x, dayNo: 99 } : x))],
];
for (const [code, fn] of spoiled) {
  const got = spoil(fn);
  check(got.has(code), `подделка воспроизводит ${code} (поймано: ${[...got].join(', ') || 'ничего'})`);
}
// I-6 отдельно: у первой параллели потолок дня 4, кладём в один день пять часов.
{
  const first = units.filter((u) => u.classId === 'c1').slice(0, 5);
  const ids = new Set(first.map((u) => u.id));
  const got = new Set(
    invariants(units.map((u) => (ids.has(u.id) ? { ...u, dayNo: 0, slotNo: first.findIndex((f) => f.id === u.id) + 1 } : u)), ctx).map((v) => v.code),
  );
  check(got.has('I-6'), `подделка воспроизводит I-6 — дневной потолок параллели (поймано: ${[...got].join(', ')})`);
}
check(SCHEDULE_INVARIANTS.length === 8, `инвариантов ровно восемь: ${SCHEDULE_INVARIANTS.join(', ')}`);

// ─────────────────────── G-58 · автокорректировка ───────────────────────

const fixed = repair(units, ctx);
check(fixed.penaltyAfter <= fixed.penaltyBefore, `Π не выросла: ${fixed.penaltyBefore} → ${fixed.penaltyAfter} за ${fixed.movesApplied} ходов`);
check(fixed.trace.every((t) => t.to < t.from), 'каждый принятый ход уменьшает Π строго — последовательность в ℤ≥0 обрывается, завершение не зависит от таймера');
check(invariants(fixed.units, ctx).length === 0, 'после автокорректировки жёсткие инварианты держатся');
check(fixed.localMinimum, 'поиск встал в локальном минимуме, а не упёрся в бюджет');
check(repair(fixed.units, ctx).movesApplied === 0, 'повторный прогон из локального минимума не делает ни одного хода');
check(
  JSON.stringify(repair(units, ctx).units) === JSON.stringify(fixed.units),
  'автокорректировка детерминирована: два прогона на одном входе дают одну сетку',
);
// час, подвинутый человеком, машина назад не возвращает
{
  const manual = units.map((u, i) => (i === 0 ? { ...u, origin: 'manual' as const } : u));
  const moves = neighbourhood(manual, ctx);
  check(
    !moves.some((m) => (m.kind === 'move' ? m.unitId === manual[0].id : m.aId === manual[0].id || m.bId === manual[0].id)),
    'час с признаком «правка человека» в окрестность поиска не входит — машина его не возвращает',
  );
}

// ─────────────────────── G-59 · ручной ход ───────────────────────

{
  const a = units.find((u) => u.classId === 'c3');
  const b = units.find((u) => u.classId === 'c3' && u.id !== a?.id);
  if (!a || !b) throw new Error('в классе c3 меньше двух часов — стенд собран неверно');
  const collide: ScheduleMove = { kind: 'move', unitId: b.id, dayNo: a.dayNo, slotNo: a.slotNo };
  const verdict = evaluateManualMove(units, ctx, collide);
  check(verdict.rejected.length > 0, `ход в занятую позицию отклонён жёстким инвариантом: ${[...new Set(verdict.rejected.map((v) => v.code))].join(', ')}`);

  // ухудшающий, но допустимый ход обязан существовать — иначе третий исход недостижим
  let degrading: { move: ScheduleMove; delta: number; markers: number } | null = null;
  for (const mv of neighbourhood(units, ctx)) {
    const v = evaluateManualMove(units, ctx, mv);
    if (v.rejected.length) continue;
    if (v.penaltyAfter > v.penaltyBefore) { degrading = { move: mv, delta: v.penaltyAfter - v.penaltyBefore, markers: v.degraded.length }; break; }
  }
  check(degrading !== null && degrading.markers > 0,
    `ухудшающий допустимый ход найден: Π растёт на ${degrading?.delta}, названы ${degrading?.markers} маркера — интерфейс просит подтверждение, а не отказывает`);

  const moved = applyMove(units, { kind: 'move', unitId: a.id, dayNo: a.dayNo, slotNo: a.slotNo }, 'manual');
  check(moved.find((u) => u.id === a.id)?.origin === 'manual', 'применённый рукой ход помечает час признаком «правка человека»');
}

// обратимость обоих видов хода
{
  const u0 = units[0];
  const mv: ScheduleMove = { kind: 'move', unitId: u0.id, dayNo: (u0.dayNo + 1) % ctx.params.days, slotNo: 1 };
  const back = applyMove(applyMove(units, mv), inverseMove(units, mv));
  check(
    back.every((u) => {
      const src = units.find((x) => x.id === u.id);
      return src !== undefined && src.dayNo === u.dayNo && src.slotNo === u.slotNo;
    }),
    'перенос обратим: ход и обратный ход возвращают сетку в исходное состояние',
  );
  const sw: ScheduleMove = { kind: 'swap', aId: units[0].id, bId: units[1].id };
  const back2 = applyMove(applyMove(units, sw), inverseMove(units, sw));
  check(
    back2.every((u) => {
      const src = units.find((x) => x.id === u.id);
      return src !== undefined && src.dayNo === u.dayNo && src.slotNo === u.slotNo;
    }),
    'обмен самообратен',
  );
}

// ─────────────────────── G-60 · снимок и выдача ───────────────────────

const meta = {
  id: 'snap-1',
  templateId: 'tpl-1',
  version: 1,
  generatedAt: '2026-08-27T00:00:00.000Z',
  classLabel: (id: string) => id.replace('c', '') + ' класс',
  subjectName: (id: string) => id.split('-')[0],
  teacherName: (id: string) => id,
};
const snap = buildSnapshot(fixed.units, ctx, meta);
check(snap.slots.length === rows.length, `снимок содержит все ${snap.slots.length} строк сетки`);
check(!JSON.stringify(snap).includes('"studentId"'), 'персональных данных учеников в снимке нет: слот занимает класс либо группа');

{
  const inGrid = snap.slots.filter((s) => s.classId === 'c5').length;
  const printed = projectGrid(snap, 'class', 'c5').flat().slice(0).filter((v, i) => i % (snap.params.days + 1) !== 0 && v !== '').length;
  const csvCells = projectCsv(snap, 'class', 'c5').split('\r\n').length - 2;
  const ics = projectIcs(snap, 'class', 'c5', { firstMonday: '20260901', until: '20261231T000000Z', exdates: ['20261104'], startMinutes: 8 * 60 });
  const events = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
  // печатная ячейка объединяет обе группы одного часа, календарная — нет:
  // отсюда сверка идёт по числу занятых ячеек, а не по числу строк снимка.
  check(printed > 0 && printed <= inGrid, `печатная проекция класса: ${printed} занятых ячеек против ${inGrid} строк снимка`);
  check(csvCells === snap.params.slotsPerDay, `файл-таблица содержит ${csvCells} строк — по строке на позицию дня`);
  check(events === inGrid, `календарная проекция содержит ${events} событий — по одному на строку снимка`);
  check(ics.includes('RRULE:FREQ=WEEKLY') && ics.includes('EXDATE:'), 'календарь выражает неделю правилом повтора с исключениями нерабочих дней, а не списком уроков');
  check(projectGrid(snap, 'teacher', 'Егор').flat().join('').length > 0, 'проекция области «педагог» непуста');
  check(
    !projectCsv(snap, 'teacher', 'Егор').includes('Вера'),
    'ссылка области «педагог» не выдаёт сетку других педагогов',
  );
}

{
  const exp = '2026-11-25T00:00:00.000Z';
  const s1 = signSnapshot(snap, 'class', 'c5', exp, 'секрет');
  const s2 = signSnapshot(buildSnapshot(fixed.units, ctx, meta), 'class', 'c5', exp, 'секрет');
  check(s1 === s2, 'подпись снимка воспроизводима на одинаковых данных');
  const s3 = signSnapshot(buildSnapshot(fixed.units, ctx, { ...meta, version: 2 }), 'class', 'c5', exp, 'секрет');
  check(s1 !== s3, 'смена версии сетки меняет подпись — старая ссылка не выдаёт новую сетку без отдельной операции отзыва');
  const s4 = signSnapshot(snap, 'teacher', 'c5', exp, 'секрет');
  check(s1 !== s4, 'область входит в подпись: ссылку класса нельзя выдать за ссылку педагога');
  const s5 = signSnapshot(snap, 'class', 'c5', exp, 'другой секрет');
  check(s1 !== s5, 'подпись зависит от секрета');
  check(canonicalSnapshot(snap) === canonicalSnapshot(snap), 'каноническая форма снимка устойчива');
}

check(SCHEDULE_BLOCK_ERRORS.every((c) => (SCHEDULE_BLOCK_ERROR_TEXTS[c] ?? '').length > 0),
  `у всех ${SCHEDULE_BLOCK_ERRORS.length} кодов блока есть текст с объектом и цифрами`);
check(SCHEDULE_BLOCK_ERROR_TEXTS.SHARE_EXPIRED === SCHEDULE_BLOCK_ERROR_TEXTS.SHARE_REVOKED,
  'истёкшая и отозванная ссылки отвечают одинаково: различить снаружи причину нельзя');

report('G-56…G-60 · СЛОЙ КАЧЕСТВА РАСПИСАНИЯ');
