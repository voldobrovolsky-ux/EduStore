/**
 * G-42 (AR-85, AR-74) — **регенерация не теряет историю.**
 *
 * Красная линия 10: отметка, поставленная человеком, переживает ЛЮБУЮ пересборку
 * расписания — урок отвязывается, а не удаляется. Перечислением по правилу
 * `detach-marked` (стенд P8):
 *   есть в новом шаблоне  → остаётся как есть, отметки на месте;
 *   нет, отметок нет      → исчезает молча, событий не порождает;
 *   нет, отметки есть     → отвязывается, издаёт `schedule.lesson.detached.v1`,
 *                           журнал помечает колонку «вне расписания» и отклоняет
 *                           И постановку, И снятие кодом `LESSON_DETACHED`.
 *
 * Плюс таксономия правок: правка контингента после `ready` сетку не пересобирает.
 *
 * Запуск: npm --workspace apps/api run regen:check
 */
import { TenantContext } from '../src/common/tenant/tenant-context';
import { ContingentService } from '../src/schoolium/contingent/contingent.service';
import { JournalService } from '../src/schoolium/journal/journal.service';
import { ScheduleService } from '../src/schoolium/schedule/schedule.service';
import { SchoolStateService } from '../src/schoolium/school-state.service';
import { bench, check, ensurePastLesson, inSchool, readySchool, refuses, report } from './schoolium/harness';

async function main(): Promise<void> {
  const b = await bench();
  const schedule = b.get(ScheduleService);
  const journal = b.get(JournalService);
  const contingent = b.get(ContingentService);
  const state = b.get(SchoolStateService);
  const drain = () => TenantContext.runAsSystem(() => b.outbox.drain());

  console.log('G-42 · регенерация не теряет историю (AR-85)\n');

  const s = await readySchool(b, 'Школа регенерации');
  await ensurePastLesson(b, s.workspaceId);

  await inSchool(s.workspaceId, async () => {
    const actor = { userId: s.teacher.userId, roles: ['teacher' as const], name: 'Иванова Мария' };
    const before = await journal.read(s.classId, s.subjectId, null);
    const past = before.columns.filter((c) => !c.future);
    check(past.length > 0, `прошедших уроков до регенерации: ${past.length}`);

    // отметки в двух прошедших уроках
    await journal.postMark(past[0].lessonId, s.studentIds[0], '5', actor);
    await journal.postMark(past[0].lessonId, s.studentIds[1], 'н', actor);
    await drain();
    const markedLesson = past[0].lessonId;
    const emptyLesson = past[1]?.lessonId ?? null;
    const marksBefore = await b.prisma.mark.count();
    check(marksBefore === 2, `выставлено отметок: ${marksBefore}`);

    // ─── меняем нагрузку так, чтобы прежние уроки не нашли себя в новом шаблоне ───
    const load = await schedule.load();
    await schedule.setLoad(
      { entries: load.entries.map((e) => ({ bindingId: e.bindingId, hoursPerWeek: 1 })), version: load.version },
      s.moderator,
    );
    await drain();
    check((await state.resolve()) === 'stale', 'правка нагрузки роняет сетку в stale (AR-85)');

    const preview = await schedule.preview();
    check(typeof preview.willDetach === 'number',
      `предпросмотр называет объём: уроков с отметками вне нового шаблона — ${preview.willDetach}`);

    // Регенерация с новым зерном повторяется, пока отвязка не произойдёт: путь
    // «урок с отметками выпал из шаблона» обязан быть пройден, а не подразумеваться.
    // На КАЖДОМ прогоне проверяется главный инвариант — отметок не убыло.
    let detached = 0;
    let rounds = 0;
    while (detached === 0 && rounds < 5) {
      rounds += 1;
      const fresh = await schedule.generate(s.moderator);
      const reg = await state.register();
      const res = await schedule.confirm({ templateId: fresh.templateId, version: reg.scheduleVersion }, s.moderator);
      await drain();
      check((await b.prisma.mark.count()) === marksBefore,
        `прогон ${rounds}: отметок по-прежнему ${marksBefore} — пересборка не стирает историю (красная линия 10)`);
      detached = await b.prisma.schoolLesson.count({ where: { detachedAt: { not: null } } });
    }
    check(detached > 0, `урок с отметками ОТВЯЗАН, а не удалён: отвязанных уроков ${detached} (прогонов ${rounds})`);

    const lesson = await b.prisma.schoolLesson.findUnique({ where: { id: markedLesson } });
    check(lesson !== null, 'помеченный отметками урок существует после пересборки — он не удалялся ни разу');
    if (lesson?.detachedAt) {
      const column = await b.prisma.journalColumn.findUnique({ where: { lessonId: markedLesson } });
      check(column?.detachedAt !== null && column !== null,
        'журнал узнал об отвязке событием schedule.lesson.detached.v1, а не сверкой таблиц расписания');
      await refuses(() => journal.postMark(markedLesson, s.studentIds[2], '4', actor),
        'LESSON_DETACHED', 'постановка отметки в отвязанный урок отклонена');
      await refuses(() => journal.removeMark(markedLesson, s.studentIds[0], actor),
        'LESSON_DETACHED', 'снятие отметки в отвязанном уроке отклонено');
      const view = await journal.read(s.classId, s.subjectId, null);
      const col = view.columns.find((c) => c.lessonId === markedLesson);
      check(col?.detached === true, 'колонка стоит на своей дате с пометкой «вне расписания», отметки читаются');
    }

    if (emptyLesson) {
      const stillThere = await b.prisma.schoolLesson.findUnique({ where: { id: emptyLesson } });
      check(stillThere === null || stillThere.detachedAt === null,
        stillThere === null
          ? 'урок БЕЗ отметок исчез вместе со старым шаблоном молча — событий не породил'
          : 'урок без отметок нашёл себя в новом шаблоне');
    }

    // ─── правка контингента после ready сетку не пересобирает ───
    check((await state.resolve()) === 'ready', 'после подтверждения школа снова ready');
    const added = await contingent.addStudent(s.classId, { lastName: 'Петров', firstName: 'Илья', sex: 'm' }, s.moderator);
    await drain();
    check((await state.resolve()) === 'ready',
      'приём ученика не переводит сетку в stale — численность класса на сетку не влияет');
    await contingent.deactivateStudent(added.id, s.moderator);
    await drain();
    check((await state.resolve()) === 'ready', 'деактивация ученика тоже оставляет школу в ready');
  });

  await b.close();
  report('G-42 · РЕГЕНЕРАЦИЯ НЕ ТЕРЯЕТ ИСТОРИЮ');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
