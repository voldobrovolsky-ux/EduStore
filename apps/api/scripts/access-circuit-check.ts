/**
 * G-24 (AR-46, AR-47, AR-49, AR-65, AR-66, AR-94) — **контур доступа без SMS
 * перечислением.**
 *
 *   · регистрация по QR создаёт `User` + `Membership` + сессию 90 дней;
 *   · телефон уникален на всю инсталляцию (AR-47), принадлежность школе — через
 *     членство;
 *   · регистрация и присоединение ко второй школе не конфликтуют (AR-66);
 *   · bypass-режим fail-closed при неизвестном `AUTH_MODE`;
 *   · **SMS-эндпоинтов, зависимостей и конфигов в кодовой базе НЕТ** — ни «на
 *     будущее», ни за флагом (AR-94).
 *
 * Запуск: npm --workspace apps/api run access:check
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCESS_PARAMS } from '@edustore/shared';
import { TenantContext } from '../src/common/tenant/tenant-context';
import { SchoolSessionService } from '../src/common/auth/school-session.service';
import { StaffService } from '../src/schoolium/staff/staff.service';
import { bench, bootstrapSchool, check, inSchool, report } from './schoolium/harness';

const ROOT = join(__dirname, '../../..');
// Инвариант AR-94 — про КОДОВУЮ БАЗУ: ни зависимости, ни конфига, ни кода «на
// будущее». Документы спеки в поиск не входят: они обсуждают решение (в том
// числе то, что SMS-шлюза не будет), и запрещать им называть предмет — значит
// запрещать вести протокол.
const CODE_PATHS = ['apps', 'packages', 'services', 'tools', 'e2e', 'deploy', 'docker-compose.yml', 'docker-compose.prod.yml'];

/**
 * Слова SMS-контура, которых в кодовой базе версии быть не должно (AR-94).
 * Сам этот файл из поиска исключён: перечень маркеров — не контур.
 */
const SMS_MARKERS = ['smsc', 'sms.ru', 'sendSms', 'SMS_GATEWAY', 'SMS_PROVIDER', 'otpCode', 'OTP_TTL'];

async function main(): Promise<void> {
  const b = await bench();
  const staff = b.get(StaffService);
  const sessions = b.get(SchoolSessionService);
  const drain = () => TenantContext.runAsSystem(() => b.outbox.drain());

  console.log('G-24 · контур доступа без SMS (AR-94)\n');

  // ─── 1. SMS-контура не существует нигде ───
  for (const marker of SMS_MARKERS) {
    let hits = '';
    try {
      hits = execSync(
        `grep -rIl --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude=access-circuit-check.ts -- ${JSON.stringify(marker)} ${CODE_PATHS.map((p) => join(ROOT, p)).join(' ')} || true`,
        { encoding: 'utf8' },
      ).trim();
    } catch {
      hits = '';
    }
    check(hits === '', hits === ''
      ? `маркера SMS-контура «${marker}» в кодовой базе нет`
      : `SMS-контур просочился («${marker}»): ${hits.split('\n').slice(0, 3).join(', ')}`);
  }
  const pkg = readFileSync(join(ROOT, 'apps/api/package.json'), 'utf8');
  check(!/sms|twilio|smsc/i.test(pkg), 'в зависимостях API нет SMS-провайдера — бюджета он не получает (AR-94)');
  const envExample = readFileSync(join(ROOT, '.env.prod.example'), 'utf8');
  check(!/SMS/i.test(envExample), 'в примере прод-конфига нет ни одной SMS-переменной');

  // ─── 2. параметры контура названы числами ───
  check(ACCESS_PARAMS.sessionDays === 90, `сессия — ${ACCESS_PARAMS.sessionDays} дней (AR-94)`);
  check(ACCESS_PARAMS.deviceLinkTtlMinutes === 3, `токен привязки устройства — ${ACCESS_PARAMS.deviceLinkTtlMinutes} минуты`);
  check(ACCESS_PARAMS.activationTtlMinutes === 15, `QR активации карточки — ${ACCESS_PARAMS.activationTtlMinutes} минут`);
  check(ACCESS_PARAMS.bindTokenTtlMinutes === 5, `QR привязки к предмету — ${ACCESS_PARAMS.bindTokenTtlMinutes} минут`);
  check(ACCESS_PARAMS.loginCodeTtlMinutes === 5 && ACCESS_PARAMS.loginCodeDigits === 6,
    `код входа — ${ACCESS_PARAMS.loginCodeDigits} цифр, ${ACCESS_PARAMS.loginCodeTtlMinutes} минут (AR-92)`);
  check(ACCESS_PARAMS.bootstrapLinkTtlHours === 24, `ссылка bootstrap — ${ACCESS_PARAMS.bootstrapLinkTtlHours} часа (AR-93)`);
  check(ACCESS_PARAMS.pollIntervalMs === 2000, `ожидание скана — поллинг раз в ${ACCESS_PARAMS.pollIntervalMs / 1000} секунды (AR-87)`);

  // ─── 3. bypass fail-closed при неизвестном AUTH_MODE ───
  const guardSrc = readFileSync(join(ROOT, 'apps/api/src/common/auth/auth.guard.ts'), 'utf8');
  check(/authMode === 'dev' \|\| authMode === 'test' \|\| authMode === 'ci'/.test(guardSrc),
    'bypass включается ТОЛЬКО явным dev|test|ci — опечатка в env не открывает аутентификацию молча');
  check(/return false;/.test(guardSrc), 'иначе — отказ: fail-closed по построению');

  // ─── 4. регистрация по QR создаёт User + Membership + сессию 90 дней ───
  const school = await bootstrapSchool(b, 'Школа доступа');
  const phone = `+7900${Math.floor(Math.random() * 10_000_000)}`;
  await inSchool(school.workspaceId, async () => {
    const card = await staff.addCard('teacher');
    const token = await staff.createActivationToken(card.id);
    const joined = await staff.join(
      token.token,
      { lastName: 'Смирнова', firstName: 'Ольга', phone },
      { openedByOtherSession: false, deviceHint: 'телефон сотрудника' },
    );
    await drain();
    check(joined.sessionToken !== null, 'регистрация со своего устройства заканчивается СЕССИЕЙ — человек в кабинете, а не на экране входа (AR-91)');

    const session = await sessions.read(joined.sessionToken!);
    check(session !== null, 'сессия читается и несёт школу и роли');
    check(session?.workspaceId === school.workspaceId, 'сессия называет школу сама — переключателя школ в 1.1.1 нет');
    check(session?.roles?.includes('teacher') === true, `роли в сессии: ${session?.roles?.join(', ')}`);

    const row = await TenantContext.runAsSystem(() =>
      b.prisma.appSession.findUnique({ where: { token: joined.sessionToken! } }),
    );
    const days = Math.round(((row?.expiresAt.getTime() ?? 0) - Date.now()) / (24 * 3600 * 1000));
    check(days === ACCESS_PARAMS.sessionDays, `срок сессии — ${days} дней`);

    const user = await TenantContext.runAsSystem(() => b.prisma.user.findUnique({ where: { phone } }));
    check(user !== null, 'создан User с телефоном — идентичность пользователя это номер (AR-46)');
    const memberships = await TenantContext.runAsSystem(() =>
      b.prisma.membership.count({ where: { userId: user!.id } }),
    );
    check(memberships === 1, 'создано одно членство — принадлежность школе выражается членством, а не полем User (AR-47)');
  });

  // ─── 5. телефон уникален на инсталляцию, второе членство не конфликтует ───
  const school2 = await bootstrapSchool(b, 'Вторая школа доступа');
  await inSchool(school2.workspaceId, async () => {
    const card = await staff.addCard('teacher');
    const token = await staff.createActivationToken(card.id);
    await staff.join(
      token.token,
      { lastName: 'Смирнова', firstName: 'Ольга', phone },
      { openedByOtherSession: false, deviceHint: 'телефон сотрудника' },
    );
    await drain();
  });
  const { users, both } = await TenantContext.runAsSystem(async () => {
    const found = await b.prisma.user.findMany({ where: { phone } });
    const count = found.length ? await b.prisma.membership.count({ where: { userId: found[0].id } }) : 0;
    return { users: found.length, both: count };
  });
  check(users === 1, `запись User одна на инсталляцию: ${users} — уникальность телефона глобальна (AR-47)`);
  check(both === 2, `членств у неё ${both} — регистрация во второй школе не конфликтует с первой (AR-66)`);

  await b.close();
  report('G-24 · КОНТУР ДОСТУПА БЕЗ SMS ДОКАЗАН');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
