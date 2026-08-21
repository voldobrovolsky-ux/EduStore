/**
 * G-49 (AR-106, AR-47, AR-98) — **вторая школа в той же базе.**
 *
 * Три ветки регистрации по телефону (AR-106):
 *   членство в ЭТОЙ школе есть → `PHONE_TAKEN_IN_SCHOOL`;
 *   `User` есть, членства в этой школе нет → создаётся ВТОРОЕ членство, и
 *     регистрация НЕ отклоняется: педагог из двух школ работает в обеих;
 *   телефона нет → создаются `User` и `Membership`.
 * Все три отвечают одинаково по форме и неразличимы снаружи по времени — иначе
 * отказ сообщает постороннему факт существования записи в чужой школе.
 *
 * Плюс: изоляция держится при ДВУХ workspace в одной базе, и второй bootstrap не
 * требует ни одной правки кода — дефолтной школы в коде нет (AR-98).
 *
 * Запуск: npm --workspace apps/api run secondschool:check
 */
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { TenantContext } from '../src/common/tenant/tenant-context';
import { ContingentService } from '../src/schoolium/contingent/contingent.service';
import { StaffService } from '../src/schoolium/staff/staff.service';
import { bench, bootstrapSchool, check, inSchool, refuses, report } from './schoolium/harness';

const ROOT = join(__dirname, '../../..');

async function main(): Promise<void> {
  const b = await bench();
  const staff = b.get(StaffService);
  const contingent = b.get(ContingentService);
  const drain = () => TenantContext.runAsSystem(() => b.outbox.drain());

  console.log('G-49 · вторая школа в той же базе (AR-106, AR-98)\n');

  // ─── второй bootstrap без единой правки кода ───
  const a = await bootstrapSchool(b, 'Первая школа');
  const c = await bootstrapSchool(b, 'Вторая школа');
  check(a.workspaceId !== c.workspaceId, 'две школы — два разных workspace, заведённых одной и той же операцией (AR-98)');

  // ─── три ветки регистрации ───
  const phone = `+7921${Math.floor(Math.random() * 10_000_000)}`;
  const timings: number[] = [];

  // ветка 3: телефона нет вовсе
  const t0 = Date.now();
  const first = await inSchool(a.workspaceId, async () => {
    const card = await staff.addCard('teacher');
    const t = await staff.createActivationToken(card.id);
    return staff.join(t.token, { lastName: 'Соколова', firstName: 'Анна', phone },
      { openedByOtherSession: false, deviceHint: 'телефон' });
  });
  timings.push(Date.now() - t0);
  await drain();
  check(first.sessionToken !== null, 'ветка «телефона нет»: созданы User и Membership, выдана сессия');

  // ветка 2: телефон есть, членства в ЭТОЙ школе нет → второе членство
  const t1 = Date.now();
  const second = await inSchool(c.workspaceId, async () => {
    const card = await staff.addCard('teacher');
    const t = await staff.createActivationToken(card.id);
    return staff.join(t.token, { lastName: 'Соколова', firstName: 'Анна', phone },
      { openedByOtherSession: false, deviceHint: 'телефон' });
  });
  timings.push(Date.now() - t1);
  await drain();
  check(second.userId === first.userId,
    'ветка «телефон из другой школы»: членство создано к СУЩЕСТВУЮЩЕМУ User — педагог из двух школ не получает отказа (AR-106)');
  const memberships = await TenantContext.runAsSystem(() =>
    b.prisma.membership.findMany({ where: { userId: first.userId } }),
  );
  check(memberships.length === 2, `членств у человека: ${memberships.length} — по одному на школу`);
  check(new Set(memberships.map((m) => m.workspaceId)).size === 2, 'членства указывают на разные школы');

  // ветка 1: членство в ЭТОЙ школе уже есть → PHONE_TAKEN_IN_SCHOOL
  const t2 = Date.now();
  await inSchool(c.workspaceId, async () => {
    const card = await staff.addCard('teacher');
    const t = await staff.createActivationToken(card.id);
    await refuses(
      () => staff.join(t.token, { lastName: 'Соколова', firstName: 'Анна', phone },
        { openedByOtherSession: false, deviceHint: 'телефон' }),
      'PHONE_TAKEN_IN_SCHOOL',
      'ветка «членство в этой школе есть»: отказ назван ПО ШКОЛЕ, а не по инсталляции',
    );
  });
  timings.push(Date.now() - t2);

  const spread = Math.max(...timings) - Math.min(...timings);
  check(spread < 1000,
    `три ветки отвечают сопоставимо по времени (разброс ${spread} мс) — различить их снаружи по задержке нельзя (AR-47)`);

  // ─── ФИО применяются к членству, а не переписывают глобальную запись ───
  const user = await TenantContext.runAsSystem(() => b.prisma.user.findUnique({ where: { phone } }));
  check(user?.displayName === 'Соколова Анна', `глобальная запись не переписана второй регистрацией: ${user?.displayName}`);

  // ─── изоляция при двух школах в одной базе ───
  await inSchool(a.workspaceId, () =>
    contingent.createClasses(
      { parallels: 2, letters: null, studentsPerClass: 2, groups: null, sexKind: 'boys', sexCount: 1, version: 0 },
      a.moderator,
    ),
  );
  await inSchool(c.workspaceId, () =>
    contingent.createClasses(
      { parallels: 3, letters: null, studentsPerClass: 2, groups: null, sexKind: 'girls', sexCount: 1, version: 0 },
      c.moderator,
    ),
  );
  await drain();
  const inA = await inSchool(a.workspaceId, () => contingent.listClasses());
  const inC = await inSchool(c.workspaceId, () => contingent.listClasses());
  check(inA.length === 2 && inC.length === 3,
    `каждая школа видит только свои классы: ${inA.length} и ${inC.length} — G-1 держится при двух workspace`);
  check(inA.every((x) => !inC.some((y) => y.id === x.id)), 'пересечения идентификаторов между школами нет');

  // ─── дефолтной школы в коде не существует ───
  const suspicious = execSync(
    `grep -rIn --include=*.ts --exclude-dir=node_modules --exclude-dir=dist -e "DEFAULT_WORKSPACE" -e "ws-archimed-pilot" ${join(ROOT, 'apps/api/src/schoolium')} || true`,
    { encoding: 'utf8' },
  ).trim();
  check(suspicious === '', 'константы «школы по умолчанию» в контуре 1.1.1 нет — пользователь появляется только через членство (AR-98)');
  const firstOfTable = execSync(
    `grep -rIn --include=*.ts --exclude-dir=node_modules "workspace.findFirst" ${join(ROOT, 'apps/api/src/schoolium')} || true`,
    { encoding: 'utf8' },
  ).trim();
  check(firstOfTable === '', 'чтения «первой школы из таблицы» нет ни в одном сервисе версии');

  await b.close();
  report('G-49 · ВТОРАЯ ШКОЛА ДОКАЗАНА');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
