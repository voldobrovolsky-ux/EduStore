/**
 * G-53 — живой Chromium-смок ПОЛНОГО онбординга пустой школы (Schoolium 1.1.1).
 *
 * Платформа заводит школу и печатает одноразовую ссылку (AR-93) → модератор
 * входит по ней → создаёт классы мастером → заполняет профили → заводит
 * предметы → карточку сотрудника → собирает расписание четырьмя экранами
 * мастера → подтверждает сетку → открывает журнал. Скриншот каждого шага.
 *
 * На каждом экране проверяются ЕГО идентификаторы из `70-screens.md`: смок
 * доказывает не «страница открылась», а «на странице стоит то, что объявлено».
 * Статическую половину той же проверки делает G-52.
 *
 * Запуск: node e2e/smoke-onboarding.mjs   (нужен Postgres; API/web поднимает сам)
 * Env: SMOKE_DATABASE_URL, CHROMIUM_PATH.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const DB = process.env.SMOKE_DATABASE_URL ?? 'postgresql://edustore:edustore@localhost:5432/edustore_onboarding?schema=public';
const SHOTS = path.join(ROOT, 'e2e', 'screenshots-onboarding');
const PHONE = '+79990001122';

const children = [];
const kill = () => children.forEach((c) => { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* */ } });
process.on('exit', kill);

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
const shOut = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts });
const spawnBg = (cmd, args, opts) => {
  const c = spawn(cmd, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  c.stdout.on('data', (d) => process.env.SMOKE_VERBOSE && process.stdout.write(d));
  c.stderr.on('data', (d) => process.env.SMOKE_VERBOSE && process.stdout.write(d));
  children.push(c);
  return c;
};

async function waitHttp(url, timeoutMs = 120_000) {
  const t0 = Date.now();
  for (;;) {
    try { await fetch(url); return; }
    catch {
      if (Date.now() - t0 > timeoutMs) throw new Error(`не дождались ${url}`);
      await new Promise((r) => setTimeout(r, 700));
    }
  }
}

let stepNo = 0;
let failures = 0;
const shot = async (page, name) => {
  stepNo++;
  const file = path.join(SHOTS, `${String(stepNo).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${path.basename(file)}`);
};

/** Утверждение о DOM: идентификатор объявлен реестром — значит он на экране. */
const has = async (page, id, note = '') => {
  const n = await page.locator(`[data-testid="${id}"]`).count();
  if (n > 0) console.log(`    ✅ ${id}${note ? ' — ' + note : ''}`);
  else { console.error(`    ❌ ${id} отсутствует на экране${note ? ' (' + note + ')' : ''}`); failures++; }
  return n > 0;
};
const hasAll = async (page, ids) => { for (const id of ids) await has(page, id); };
const click = (page, id) => page.locator(`[data-testid="${id}"]`).first().click();
/** Тот же контракт, что зовёт экран, но из контекста страницы — куки те же. */
const api = async (page, method, p, body) => {
  const r = await page.request.fetch(`${API}${p}`, { method, data: body ?? undefined });
  if (!r.ok()) throw new Error(`${method} ${p} → ${r.status()}: ${await r.text()}`);
  return r.json();
};
const fill = (page, id, v) => page.locator(`[data-testid="${id}"]`).first().fill(String(v));

async function main() {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  // ── чистая база: онбординг ПУСТОЙ школы иначе не докажешь ──
  // `?schema=` понимает Prisma, но не psql — служебное подключение чистое.
  const u = new URL(DB);
  const dbName = u.pathname.replace(/^\//, '');
  const admin = `${u.protocol}//${u.username}:${u.password}@${u.host}/postgres`;
  console.log(`▶ пересоздание базы ${dbName}`);
  const psql = (sql, url) => shOut(`psql "${url}" -v ON_ERROR_STOP=1 -c ${JSON.stringify(sql)}`);
  try {
    psql(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`, admin);
    psql(`CREATE DATABASE "${dbName}"`, admin);
  } catch (e) {
    console.error('не удалось пересоздать базу:', e.message);
    process.exit(1);
  }

  console.log('▶ prisma migrate deploy');
  sh('npx prisma migrate deploy', { cwd: path.join(ROOT, 'apps/api'), env: { ...process.env, DATABASE_URL: DB } });
  console.log('▶ build api + web');
  if (!fs.existsSync(path.join(ROOT, 'apps/api/dist/main.js'))) sh('npm run build', { cwd: path.join(ROOT, 'apps/api') });
  if (!fs.existsSync(path.join(ROOT, 'apps/web/dist/index.html'))) sh('npm run build', { cwd: path.join(ROOT, 'apps/web') });

  // ── платформа заводит школу: экрана у этой операции нет и не будет (AR-93) ──
  console.log('▶ bootstrap школы');
  const out = shOut(
    `npx ts-node scripts/school-bootstrap.ts --phone=${PHONE} --school="Школа смока" --name="Иванова Мария Петровна"`,
    { cwd: path.join(ROOT, 'apps/api'), env: { ...process.env, DATABASE_URL: DB, WEB_ORIGIN: WEB } },
  );
  const link = (out.match(/https?:\/\/\S*\/bootstrap\/[a-f0-9]+/) ?? [])[0];
  if (!link) { console.error('bootstrap не напечатал ссылку:\n' + out); process.exit(1); }
  console.log(`  ссылка входа: ${link.slice(0, 48)}…`);

  console.log('▶ старт api + web');
  spawnBg('node', ['dist/main.js'], {
    cwd: path.join(ROOT, 'apps/api'),
    env: { ...process.env, DATABASE_URL: DB, PORT: '3000', AUTH_MODE: 'production', WEB_ORIGIN: WEB },
  });
  spawnBg('npx', ['vite', 'preview', '--port', '5173', '--strictPort'], { cwd: path.join(ROOT, 'apps/web') });
  await waitHttp(`${API}/api/v1/me`);
  await waitHttp(WEB);

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  // Десктоп ≥768px: промежуточной верстки нет, проверяется одна из двух раскладок.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error(`    ❌ ошибка страницы: ${e.message}`); failures++; });

  try {
    // ── S-00 · лендинг анонима ──
    console.log('▶ S-00 · лендинг');
    await page.goto(`${WEB}/`);
    await page.waitForSelector('[data-testid="S-00.hero"]');
    await hasAll(page, ['S-00.logo', 'S-00.hero', 'S-00.btn.login']);
    await shot(page, 'S-00-landing');

    // ── S-01 · вход по QR (аноним): страница выдаёт код и ждёт скан ──
    console.log('▶ S-01 · вход');
    await click(page, 'S-00.btn.login');
    await page.waitForSelector('[data-testid="S-01.qr"]');
    await hasAll(page, ['S-01.qr', 'S-01.caption', 'S-01.status', 'S-01.link.byCode', 'S-01.note.help']);
    await shot(page, 'S-01-login');

    // ── S-05 · вход по коду от модератора ──
    console.log('▶ S-05 · вход по коду');
    await click(page, 'S-01.link.byCode');
    await page.waitForSelector('[data-testid="S-05.code"]');
    await hasAll(page, ['S-05.code', 'S-05.hint', 'S-05.btn.back']);
    await shot(page, 'S-05-login-code');

    // ── bootstrap: первый модератор входит по одноразовой ссылке ──
    console.log('▶ /bootstrap/:token · первый модератор');
    await page.goto(link);
    await page.waitForSelector('[data-testid="S-10.empty"], [data-testid="S-10.grid.classes"]', { timeout: 30_000 });
    await shot(page, 'bootstrap-in');

    // ── S-10 · пустая школа ──
    console.log('▶ S-10 · классы (пусто)');
    await hasAll(page, ['S-10.empty', 'S-10.btn.newClasses', 'L.sidebar', 'L.topbar.title']);
    await shot(page, 'S-10-empty');

    // ── S-11 · мастер создания классов: пять шагов в порядке реестра ──
    console.log('▶ S-11 · мастер классов');
    await click(page, 'S-10.btn.newClasses');
    await page.waitForSelector('[data-testid="M-01"]');
    await has(page, 'S-11.input.parallels');
    await fill(page, 'S-11.input.parallels', '2');
    await shot(page, 'S-11-step1-parallels');
    await click(page, 'M-01.next');

    await page.waitForSelector('[data-testid="S-11.seg.letters"]');
    await hasAll(page, ['S-11.seg.letters', 'S-11.btn.noLetters']);
    await click(page, 'S-11.btn.noLetters'); // явный маркер отсутствия (AR-77)
    await shot(page, 'S-11-step2-letters');
    await click(page, 'M-01.next');

    await page.waitForSelector('[data-testid="S-11.input.students"]');
    await fill(page, 'S-11.input.students', '4');
    await shot(page, 'S-11-step3-students');
    await click(page, 'M-01.next');

    await page.waitForSelector('[data-testid="S-11.input.groups"]');
    await hasAll(page, ['S-11.input.groups', 'S-11.btn.noGroups']);
    await click(page, 'S-11.btn.noGroups');
    await shot(page, 'S-11-step4-groups');
    await click(page, 'M-01.next');

    await page.waitForSelector('[data-testid="S-11.radio.sexKind"]');
    await hasAll(page, ['S-11.radio.sexKind', 'S-11.input.sexCount', 'S-11.calc.otherSex', 'S-11.preview']);
    await fill(page, 'S-11.input.sexCount', '2');
    await has(page, 'S-11.preview', 'превью называет классы поимённо до создания (Д5)');
    await shot(page, 'S-11-step5-preview');
    await click(page, 'S-11.btn.create');

    await page.waitForSelector('[data-testid="S-10.grid.classes"]', { timeout: 20_000 });
    await hasAll(page, ['S-10.grid.classes', 'S-10.card.class']);
    await shot(page, 'S-10-classes');

    // ── S-12 · карточка класса и профили ──
    console.log('▶ S-12 · профили учеников');
    await click(page, 'S-10.card.class');
    await page.waitForSelector('[data-testid="S-12.table.roster"]');
    await hasAll(page, ['S-12.title', 'S-12.table.roster', 'S-12.row.empty', 'S-12.btn.addStudent']);
    await shot(page, 'S-12-class');

    // Заполняем ЧЕТЫРЕ профиля — иначе школа не выйдет из students_filled.
    const kids = [
      ['Абрамов', 'Иван', 'Петрович', 'm'],
      ['Борисова', 'Анна', 'Ильинична', 'f'],
      ['Ветров', 'Пётр', '', 'm'],
      ['Гуляева', 'Мария', '', 'f'],
    ];
    for (const [last, first, mid, sex] of kids) {
      await page.locator('[data-testid="S-12.row.empty"]').first().click();
      await page.waitForSelector('[data-testid="S-13.input.lastName"]');
      await fill(page, 'S-13.input.lastName', last);
      await fill(page, 'S-13.input.firstName', first);
      if (mid) await fill(page, 'S-13.input.middleName', mid);
      await page.locator(`[data-testid="S-13.radio.sex"] input[value="${sex}"]`).check();
      if (last === 'Абрамов') {
        await hasAll(page, ['S-13.input.lastName', 'S-13.input.firstName', 'S-13.input.middleName', 'S-13.radio.sex', 'S-13.btn.save']);
        await shot(page, 'S-13-student');
      }
      await click(page, 'S-13.btn.save');
      await page.waitForSelector('[data-testid="S-13.input.lastName"]', { state: 'detached', timeout: 15_000 });
    }
    await shot(page, 'S-12-filled');

    // ── S-20 · предметы ──
    console.log('▶ S-20 · предметы');
    await page.goto(`${WEB}/subjects`);
    await page.waitForSelector('[data-testid="S-20.empty"]');
    await has(page, 'S-20.empty');
    await shot(page, 'S-20-empty');
    await click(page, 'S-20.btn.newSubject');
    await page.waitForSelector('[data-testid="M-03"]');
    await hasAll(page, ['M-03.input.name', 'M-03.select.class']);
    await fill(page, 'M-03.input.name', 'Математика');
    await shot(page, 'M-03-create-subject');
    await click(page, 'M-03.create');
    await page.waitForSelector('[data-testid="S-20.grid.subjects"]', { timeout: 20_000 });
    await hasAll(page, ['S-20.grid.subjects', 'S-20.card.subject', 'S-20.card.subject.badge']);
    await shot(page, 'S-20-subjects');

    // ── S-30 · персонал ──
    console.log('▶ S-30 · персонал');
    await page.goto(`${WEB}/staff`);
    await page.waitForSelector('[data-testid="S-30.section.level3"]');
    await hasAll(page, ['S-30.section.level1', 'S-30.section.level2', 'S-30.section.level3', 'S-30.btn.addTeacher']);
    await shot(page, 'S-30-staff');

    // ── S-31 · карточка сотрудника и QR активации ──
    console.log('▶ S-31 · карточка педагога');
    await click(page, 'S-30.btn.addTeacher');
    // «Добавить» заводит ПУСТУЮ карточку (§10) — открывает её отдельный клик.
    const teacherCards = page.locator('[data-testid="S-30.section.level3"] [data-testid="S-30.card.person"]');
    await teacherCards.first().waitFor({ timeout: 20_000 });
    await has(page, 'S-30.card.person');
    await teacherCards.last().click();
    await page.waitForSelector('[data-testid="M-06"]', { timeout: 20_000 });
    // На ПУСТОЙ карточке есть только QR и статус: кода входа не существует,
    // пока карточку никто не активировал, а бейджа «деактивирован» — пока
    // некого деактивировать. Оба появляются ниже по потоку.
    await hasAll(page, ['S-31.qr', 'S-31.status', 'S-31.btn.close']);
    await shot(page, 'S-31-staff-card');

    // ── ТЕЛЕФОННАЯ половина: регистрация педагога и скан QR предмета ──
    // Десктопного пути у неё нет по построению (`S-70`: «сканер доступен на
    // телефоне»), поэтому смок делает её тем же контрактом, что и телефон.
    // Это СТЕНДОВОЕ устройство, а не поведение продукта.
    console.log('▶ телефон педагога (контрактом): активация карточки и привязка');
    const cards = await api(page, 'GET', '/api/v1/staff');
    const card = cards.find((c) => c.roles.includes('teacher') && !c.userId) ?? cards.find((c) => c.roles.includes('teacher'));
    const act = await api(page, 'POST', `/api/v1/staff/${card.id}/activation-token`);
    const phoneCtx = await browser.newContext({ locale: 'ru-RU' });
    const phone = await phoneCtx.newPage();
    await phone.goto(`${WEB}/join/${act.token}`);
    await phone.waitForSelector('[data-testid="S-03.input.lastName"]');
    await hasAll(phone, ['S-03.header.role', 'S-03.input.lastName', 'S-03.input.firstName', 'S-03.input.middleName', 'S-03.input.phone', 'S-03.btn.submit']);
    await fill(phone, 'S-03.input.lastName', 'Смирнов');
    await fill(phone, 'S-03.input.firstName', 'Олег');
    await fill(phone, 'S-03.input.phone', '+79995558877');
    await shot(phone, 'S-03-join');
    await click(phone, 'S-03.btn.submit');
    await phone.waitForSelector('[data-testid="S-04.btn.skip"]', { timeout: 20_000 });
    await hasAll(phone, ['S-04.avatar', 'S-04.btn.attach', 'S-04.btn.skip']);
    await shot(phone, 'S-04-photo');

    // Модератор видит активацию на своей карточке — поллинг раз в 2 секунды (AR-87).
    await page.waitForSelector('[data-testid="S-31.btn.loginCode"]', { timeout: 20_000 });
    await hasAll(page, ['S-31.btn.loginCode', 'S-31.btn.addRole']);
    // Подмену «удалить» → «деактивировать» решает СЕРВЕР (AR-89): на экране
    // ровно одна из двух кнопок, и обе сразу — дефект.
    const del = await page.locator('[data-testid="S-31.btn.deleteStaff"]').count();
    const deact = await page.locator('[data-testid="S-31.btn.deactivateStaff"]').count();
    if (del + deact === 1) console.log(`    ✅ ровно одна кнопка из пары «удалить/деактивировать» (${del ? 'удалить' : 'деактивировать'})`);
    else { console.error(`    ❌ кнопок пары «удалить/деактивировать» на экране ${del + deact}, должна быть одна`); failures++; }
    await shot(page, 'S-31-activated');
    // Код входа на случай «телефона нет под рукой» (`S-05`) — шесть цифр.
    await click(page, 'S-31.btn.loginCode');
    await page.waitForSelector('[data-testid="S-31.loginCode"]', { timeout: 20_000 });
    await has(page, 'S-31.loginCode', 'код показывается модератору, а не отправляется SMS (AR-94)');
    await shot(page, 'S-31-login-code');
    await click(page, 'S-31.btn.close');
    console.log('    · `S-31.badge.inactive` требует деактивированной карточки — вне пути онбординга, доказан G-52');

    // ── S-21/S-22 · карточка предмета и QR привязки ──
    console.log('▶ S-21/S-22 · привязка педагога');
    await page.goto(`${WEB}/subjects`);
    await page.waitForSelector('[data-testid="S-20.card.subject"]');
    await click(page, 'S-20.card.subject');
    await page.waitForSelector('[data-testid="M-04"]');
    await hasAll(page, ['S-21.list.bindings', 'S-21.status.coverage', 'S-21.btn.bind']);
    await shot(page, 'S-21-subject-card');
    await click(page, 'S-21.btn.bind');
    await page.waitForSelector('[data-testid="M-05"]', { timeout: 20_000 });
    await hasAll(page, ['S-22.qr', 'S-22.caption', 'S-22.scope']);
    await shot(page, 'S-22-bind-qr');

    // Телефон сканирует ИМЕННО ТОТ QR, что сейчас на экране модератора: код
    // берётся из хранилища токенов — камеру в смоке заменить нечем, а вторая
    // выдача кода сделала бы экран и телефон разными сценами.
    const token = shOut(
      `psql "${DB.replace(/\?.*$/, '')}" -qtAc "select token from \\"ActivationToken\\" where purpose='subject_bind' and state='waiting' order by \\"createdAt\\" desc limit 1"`,
    ).trim();
    if (!token) { console.error('    ❌ токен привязки не найден в хранилище'); failures++; }
    await api(phone, 'POST', '/api/v1/subjects/scan', { token });
    // Экран узнаёт о скане поллингом (AR-87), после чего модератор выбирает
    // объём привязки: «весь класс» либо группы — они взаимоисключаемы (Д6).
    await page.locator('[data-testid="S-22.scope"] button', { hasText: 'Весь класс' }).waitFor({ timeout: 20_000 });
    await page.locator('[data-testid="S-22.scope"] button', { hasText: 'Весь класс' }).click();
    await page.waitForSelector('[data-testid="S-22.btn.confirm"]:not([disabled])', { timeout: 20_000 });
    await shot(page, 'S-22-scanned');
    await click(page, 'S-22.btn.confirm');
    await page.waitForSelector('[data-testid="M-05"]', { state: 'detached', timeout: 20_000 });
    // Карточка предмета закрывается вместе с привязкой — открываем заново и
    // смотрим, что покрытие пересчитано и педагог в списке.
    await page.goto(`${WEB}/subjects`);
    await page.waitForSelector('[data-testid="S-20.card.subject"]');
    await click(page, 'S-20.card.subject');
    await page.waitForSelector('[data-testid="S-21.status.coverage"]');
    const coverage = await page.locator('[data-testid="S-21.status.coverage"]').innerText();
    if (/полное/i.test(coverage)) console.log('    ✅ покрытие пересчитано: «Покрытие полное»');
    else { console.error(`    ❌ после привязки покрытие осталось «${coverage}»`); failures++; }
    await shot(page, 'S-21-covered');
    await page.keyboard.press('Escape');

    // ── S-40 · расписание: до сборки уроков нет ──
    console.log('▶ S-40 · расписание');
    await page.goto(`${WEB}/schedule`);
    await page.waitForSelector('[data-testid="S-40.empty"], [data-testid="S-40.grid.week"]');
    await has(page, 'S-40.empty', 'сетки ещё нет');
    await shot(page, 'S-40-empty');

    // ── S-41 · мастер расписания, четыре экрана ──
    console.log('▶ S-41 · мастер расписания');
    await click(page, 'S-40.btn.setup');
    await page.waitForSelector('[data-testid="M-08"]');
    await hasAll(page, ['S-41.panel.term1', 'S-41.panel.term2', 'S-41.panel.term3', 'S-41.panel.term4']);
    const dates = [['2026-09-01', '2026-10-25'], ['2026-11-05', '2026-12-28'], ['2027-01-11', '2027-03-21'], ['2027-04-01', '2027-05-26']];
    for (let i = 0; i < 4; i++) {
      const panel = page.locator('[data-testid^="S-41.panel.term"]').nth(i);
      await panel.locator('input[type="date"]').nth(0).fill(dates[i][0]);
      await panel.locator('input[type="date"]').nth(1).fill(dates[i][1]);
    }
    await has(page, 'S-41.term.check', 'заполненная четверть отмечена галочкой');
    await shot(page, 'S-41-step1-terms');
    await click(page, 'S-41.btn.next1');

    await page.waitForSelector('[data-testid="S-41.accordion.teacher"]', { timeout: 20_000 });
    await hasAll(page, ['S-41.accordion.teacher', 'S-41.input.hours', 'S-41.summary.class']);
    const hours = page.locator('[data-testid="S-41.input.hours"]');
    for (let i = 0; i < await hours.count(); i++) await hours.nth(i).fill('4');
    await shot(page, 'S-41-step2-load');
    await click(page, 'S-41.btn.next2');

    await page.waitForSelector('[data-testid="S-41.chips.priority"]', { timeout: 20_000 });
    await hasAll(page, ['S-41.chips.priority', 'S-41.btn.noPriority']);
    await click(page, 'S-41.btn.noPriority');
    await shot(page, 'S-41-step3-priority');
    await click(page, 'S-41.btn.next3');

    await page.waitForSelector('[data-testid="S-41.input.slotsPerDay"]', { timeout: 20_000 });
    await hasAll(page, ['S-41.input.slotsPerDay', 'S-41.input.lessonMin', 'S-41.input.breakMin', 'S-41.input.days', 'S-41.select.bigBreakAfter', 'S-41.input.bigBreakMin', 'S-41.calc.dayLength']);
    await fill(page, 'S-41.input.slotsPerDay', '5');
    // Длина дня считается на экране из четырёх параметров, а не «примерно».
    const dayLen = await page.locator('[data-testid="S-41.calc.dayLength"]').innerText();
    console.log(`    · длина учебного дня по параметрам: ${dayLen.replace(/\s+/g, ' ').trim()}`);
    await shot(page, 'S-41-step4-day');
    await click(page, 'S-41.btn.generate');

    // ── S-42 · генерация и предпросмотр ──
    console.log('▶ S-42 · генерация и подтверждение');
    await page.waitForSelector('[data-testid="S-42.grid.preview"], [data-testid="S-42.refusal"]', { timeout: 90_000 });
    if (await page.locator('[data-testid="S-42.refusal"]').count()) {
      await shot(page, 'S-42-refusal');
      console.error('    ❌ генератор отказал — сетка не собрана');
      failures++;
    } else {
      await hasAll(page, ['S-42.grid.preview', 'S-42.btn.regenerate', 'S-42.btn.confirm']);
      await shot(page, 'S-42-preview');
      await click(page, 'S-42.btn.confirm');
      await page.waitForSelector('[data-testid="S-40.grid.week"]', { timeout: 60_000 });
      // Плашки «устарело» здесь нет и быть не должно: сетка только что
      // подтверждена. `S-40.banner.stale` и кнопка регенерации в ней живут в
      // состоянии `stale` — оно доказано воротами G-42 на контракте.
      await hasAll(page, ['S-40.grid.week', 'S-40.btn.setup']);
      const stale = await page.locator('[data-testid="S-40.banner.stale"]').count();
      if (stale === 0) console.log('    ✅ сразу после подтверждения плашки «устарело» нет');
      else { console.error('    ❌ подтверждённая сетка объявлена устаревшей'); failures++; }
      await shot(page, 'S-40-confirmed');

      // ── S-50 · журнал: колонки = материализованные уроки ──
      console.log('▶ S-50 · журнал');
      await page.goto(`${WEB}/journal`);
      await page.waitForSelector('[data-testid="S-50.table"], [data-testid="S-50.empty"], [data-testid="S-50.empty.holidays"]', { timeout: 30_000 });
      await hasAll(page, ['S-50.select.class', 'S-50.select.subject']);
      if (await page.locator('[data-testid="S-50.table"]').count()) {
        await hasAll(page, ['S-50.table', 'S-50.colhead.date', 'S-50.cell.mark', 'S-50.col.average']);
      } else {
        console.log('    · уроков в горизонте нет (каникулы либо пустая дата) — таблица не строится');
      }
      await shot(page, 'S-50-journal');
    }

    // ── S-60 · кабинет модератора ──
    console.log('▶ S-60 · кабинет модератора');
    await page.goto(`${WEB}/admin`);
    await page.waitForSelector('[data-testid="S-60.nav"]');
    await hasAll(page, ['S-60.nav', 'S-60.audit']);
    await shot(page, 'S-60-admin');

    // ── S-80 · устройства и сессии ──
    console.log('▶ S-80 · устройства');
    await page.goto(`${WEB}/settings/devices`);
    await page.waitForSelector('[data-testid="S-80.list.sessions"]');
    await has(page, 'S-80.list.sessions');
    await shot(page, 'S-80-devices');

    // ── S-70 · сканер: на десктопе — причина, а не заглушка ──
    console.log('▶ S-70 · сканер (десктоп)');
    await phone.goto(`${WEB}/scan`);
    await phone.waitForSelector('[data-testid="S-70.hint.desktop"], [data-testid="S-70.viewfinder"], [data-testid="S-70.error.denied"]');
    await shot(phone, 'S-70-scan');

    await phoneCtx.close();
    console.log(`\n${failures === 0 ? '✅' : '❌'} G-53: шагов со скриншотами ${stepNo}, нарушений ${failures}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
  if (failures) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
