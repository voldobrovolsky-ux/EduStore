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
 * **Учебный день зафиксирован** (AR-117, `SCHOOL_TODAY`). Без этого смок
 * зависел от календаря: школа заводится «сегодня», учебный год начинается
 * 1 сентября, материализация идёт вперёд — значит все колонки журнала будущие,
 * ни одна ячейка не кликается, и шаг ворот «отметка в журнале» недостижим. С
 * фиксированным днём внутри первой четверти смок ставит отметку и заполняет
 * тему так же, как это делает педагог, а колонки следующих дней остаются
 * будущими и доказывают `S-50.col.future` на том же экране.
 *
 * Запуск: node e2e/smoke-onboarding.mjs   (нужен Postgres; API/web поднимает сам)
 * Env: SMOKE_DATABASE_URL, SMOKE_SCHOOL_DAY, CHROMIUM_PATH.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const DB = process.env.SMOKE_DATABASE_URL ?? 'postgresql://edustore:edustore@localhost:5432/edustore_onboarding?schema=public';
const SHOTS = path.join(ROOT, 'e2e', 'screenshots-onboarding');
const PHONE = '+79990001122';
/**
 * Учебный день смока: понедельник внутри первой четверти рекомендованного
 * графика (2026-09-01…2026-10-26), не выходной по производственному календарю.
 * Уроки этого дня уже прошли (`future` — строгое «позже сегодня»), уроки
 * следующих дней — ещё нет, и на том же экране доказывают `S-50.col.future`.
 *
 * Пара «день × зерно» СВЯЗАНА: генератор распределяет часы по дням случайно в
 * пределах зерна, и при другом `SMOKE_GEN_SEED` понедельник может оказаться
 * пустым. Смок это не угадывает — он падает и печатает, какие дни сетка заняла.
 */
const SCHOOL_DAY = process.env.SMOKE_SCHOOL_DAY ?? '2026-09-14';
/** Понедельник = 0 — та же нумерация, что у `TemplateSlotDto.dayNo`. */
const SCHOOL_DAY_NO = (new Date(`${SCHOOL_DAY}T00:00:00.000Z`).getUTCDay() + 6) % 7;
/**
 * Четверти смок берёт из ЕДИНСТВЕННОГО источника рекомендации (AR-36) — из
 * пакета контрактов, а не переписывает даты руками: список, разъехавшийся с
 * продуктом, превратил бы ворота в проверку собственных констант.
 */
/**
 * Зерно генератора фиксировано (AR-97): при свободном зерне сетка каждый прогон
 * другая, и «есть ли урок во вторник» становится вопросом удачи. Ворота, у
 * которых объём проверенного зависит от случайного числа, доказывают разное в
 * разные дни — ровно та же болезнь, что и плавающий учебный день.
 */
const GEN_SEED = process.env.SMOKE_GEN_SEED ?? '20260915';
const { recommendedTerms } = createRequire(import.meta.url)(
  path.join(ROOT, 'packages/shared/dist/schoolium.js'),
);

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

/**
 * Порт занят чужим процессом — не «сервер уже готов», а проверка не того сервера
 * (диагностика этапа 2, Д10): `waitHttp` считает порт готовым, как только по нему
 * кто-то ответил, и осиротевший процесс прошлого прогона молча подменяет предмет
 * ворот. Падаем сразу и по имени.
 */
async function assertPortFree(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(2000) }); }
  catch { return; } // никто не ответил — порт свободен, это и нужно
  console.error(`порт занят: по ${url} уже кто-то отвечает. Смок поднимает свои API и веб — снимите чужой процесс`);
  process.exit(1);
}

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
  // Собираем ВСЕГДА. Условие «нет dist — собери» экономило десять секунд и
  // тихо гоняло ворота по сборке прошлого прогона: правка в исходнике
  // проверялась не она. Локально это читается как «мой фикс не работает».
  sh('npm run build', { cwd: path.join(ROOT, 'apps/api') });
  sh('npm run build', { cwd: path.join(ROOT, 'apps/web') });

  // ── платформа заводит школу: экрана у этой операции нет и не будет (AR-93) ──
  console.log('▶ bootstrap школы');
  const out = shOut(
    `npx ts-node scripts/school-bootstrap.ts --phone=${PHONE} --school="Школа смока" --name="Иванова Мария Петровна"`,
    { cwd: path.join(ROOT, 'apps/api'), env: { ...process.env, DATABASE_URL: DB, WEB_ORIGIN: WEB } },
  );
  const link = (out.match(/https?:\/\/\S*\/bootstrap\/[a-f0-9]+/) ?? [])[0];
  if (!link) { console.error('bootstrap не напечатал ссылку:\n' + out); process.exit(1); }
  console.log(`  ссылка входа: ${link.slice(0, 48)}…`);

  await assertPortFree(`${API}/api/v1/me`);
  await assertPortFree(WEB);

  console.log('▶ старт api + web');
  spawnBg('node', ['dist/main.js'], {
    cwd: path.join(ROOT, 'apps/api'),
    env: { ...process.env, DATABASE_URL: DB, PORT: '3000', AUTH_MODE: 'production', WEB_ORIGIN: WEB, SCHOOL_TODAY: SCHOOL_DAY, GEN_SEED: GEN_SEED },
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
    await hasAll(page, ['S-10.empty', 'S-10.btn.newClasses', 'L.sidebar', 'L.sidebar.logo', 'L.sidebar.item.admin', 'L.sidebar.user', 'L.sidebar.collapse', 'L.topbar.title']);
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
    // Панели приходят из календаря — у первого шага есть состояние загрузки
    // (скелетоны той же геометрии), и утверждать до него значит ловить гонку.
    await page.waitForSelector('[data-testid="S-41.panel.term1"]', { timeout: 20_000 });
    await hasAll(page, ['S-41.panel.term1', 'S-41.panel.term2', 'S-41.panel.term3', 'S-41.panel.term4']);
    // Реестр требует панели ПРЕДЗАПОЛНЕННЫМИ графиком ФООП, а не пустыми
    // (`70-screens.md` S-41 экран 1): пустой ввод с нуля — дефект, а не мелочь.
    const prefilled = await page.locator('[data-testid^="S-41.panel.term"] input[type="date"]').evaluateAll((n) => n.map((x) => x.value));
    if (prefilled.length === 8 && prefilled.every(Boolean)) console.log(`    ✅ панели четвертей предзаполнены: ${prefilled[0]}…${prefilled[7]}`);
    else { console.error(`    ❌ панели четвертей пришли пустыми: ${JSON.stringify(prefilled)}`); failures++; }
    // Модератор правит рекомендацию — здесь под учебный год смока (AR-117).
    const dates = recommendedTerms(SCHOOL_DAY);
    for (let i = 0; i < 4; i++) {
      const panel = page.locator('[data-testid^="S-41.panel.term"]').nth(i);
      await panel.locator('input[type="date"]').nth(0).fill(dates[i].dateFrom);
      await panel.locator('input[type="date"]').nth(1).fill(dates[i].dateTo);
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
      // подтверждена. Обратное состояние проверяется ниже, после журнала:
      // правка нагрузки роняет сетку в `stale` и поднимает плашку (AR-85).
      await hasAll(page, ['S-40.grid.week', 'S-40.btn.setup']);
      const stale = await page.locator('[data-testid="S-40.banner.stale"]').count();
      if (stale === 0) console.log('    ✅ сразу после подтверждения плашки «устарело» нет');
      else { console.error('    ❌ подтверждённая сетка объявлена устаревшей'); failures++; }
      await shot(page, 'S-40-confirmed');

      // ── S-50 · журнал: колонки = материализованные уроки ──
      // Пара «класс × предмет» выбирается не наугад: берётся та, у которой урок
      // стоит В УЧЕБНЫЙ ДЕНЬ смока, — иначе первой колонкой окажется завтрашний
      // урок, и «отметка в журнале» упрётся в честный `LESSON_NOT_HELD`.
      console.log('▶ S-50 · журнал');
      const week = await api(page, 'GET', '/api/v1/schedule');
      const usedDays = [...new Set(week.slots.map((sl) => sl.dayNo))].sort();
      const slotToday = week.slots.find((sl) => sl.dayNo === SCHOOL_DAY_NO);
      if (!slotToday) {
        console.error(
          `    ❌ в сетке нет ни одного урока на ${SCHOOL_DAY} (день недели ${SCHOOL_DAY_NO}); сетка занимает дни ${usedDays.join(', ')}.\n` +
            '       Поправьте SMOKE_SCHOOL_DAY на дату из занятых дней внутри первой четверти либо SMOKE_GEN_SEED.',
        );
        failures++;
        throw new Error('нет урока в учебный день смока — шаг «отметка в журнале» недостижим');
      }
      // Журнал строит колонки ПОДПИСКОЙ на schedule.lesson.materialized.v1
      // через outbox, который дренируется раз в 2 с (apps/api/src/common/
      // outbox/outbox.worker.ts, интервал 'outbox-drain'). Сразу после
      // подтверждения сетки строка `JournalColumn` может ещё не существовать —
      // это не баг журнала, а нормальная задержка eventual consistency.
      // Единичный `waitForSelector` резолвится и на `S-50.empty`, который тут
      // временное состояние, а не окончательное: ждём появления таблицы
      // перебором, а не один раз.
      let journalReady = false;
      for (let attempt = 0; attempt < 10 && !journalReady; attempt++) {
        await page.goto(`${WEB}/journal?classId=${slotToday.classId}&subjectId=${slotToday.subjectId}`);
        await page.waitForSelector('[data-testid="S-50.table"], [data-testid="S-50.empty"], [data-testid="S-50.empty.holidays"]', { timeout: 15_000 });
        journalReady = (await page.locator('[data-testid="S-50.table"]').count()) > 0;
        if (!journalReady) await page.waitForTimeout(1500);
      }
      if (!journalReady) {
        console.error('    ❌ S-50.table не появился за 10 попыток — outbox не продренировал schedule.lesson.materialized.v1');
        failures++;
        throw new Error('журнал не построил колонку урока в учебный день смока');
      }
      await hasAll(page, ['S-50.select.class', 'S-50.select.subject']);
      await hasAll(page, ['S-50.table', 'S-50.colhead.date', 'S-50.cell.mark', 'S-50.col.average']);
      console.log(`    · ${slotToday.classLabel}, ${slotToday.subjectName} — урок в учебный день смока (${SCHOOL_DAY})`);

      // Колонки следующих дней горизонта — будущие, и это видно на том же экране.
      const futureCols = await page.locator('[data-testid="S-50.col.future"]').count();
      if (futureCols > 0) console.log(`    ✅ S-50.col.future — колонок будущих уроков ${futureCols}`);
      else { console.error('    ❌ S-50.col.future отсутствует: горизонт не содержит ни одного будущего урока'); failures++; }
      await shot(page, 'S-50-journal');

      // ── S-52 · отметка: шаг ворот этапа 2, который делает журнал живым ──
      console.log('▶ S-52 · выбор отметки');
      // Колонка сегодняшнего урока — единственная непомеченная как будущая.
      const todayCol = await page.locator('table[data-testid="S-50.table"] thead th').evaluateAll((ths) =>
        ths.findIndex((th) => th.querySelector('[data-testid="S-50.colhead.date"]') && th.getAttribute('data-testid') !== 'S-50.col.future'),
      );
      if (todayCol < 1) { console.error('    ❌ колонки прошедшего урока на экране нет'); failures++; }
      const cellOf = (row) => page.locator(`[data-cell="${row}:${todayCol - 1}"]`);
      await cellOf(0).click();
      await page.waitForSelector('[data-testid="S-52.chip.m5"]', { timeout: 20_000 });
      await hasAll(page, ['S-52.chip.m5', 'S-52.chip.m4', 'S-52.chip.m3', 'S-52.chip.m2', 'S-52.chip.n', 'S-52.chip.b', 'S-52.btn.clear']);
      // Порядок шкалы — часть смысла, а не оформления (AR-79): «б» после «н».
      const order = await page.locator('[data-testid^="S-52.chip."]').evaluateAll((n) => n.map((x) => x.getAttribute('data-testid')));
      const wantOrder = ['S-52.chip.m5', 'S-52.chip.m4', 'S-52.chip.m3', 'S-52.chip.m2', 'S-52.chip.n', 'S-52.chip.b'];
      if (JSON.stringify(order) === JSON.stringify(wantOrder)) console.log('    ✅ шесть чипов в порядке 5 4 3 2 н б (AR-79)');
      else { console.error(`    ❌ порядок чипов: ${order.join(' ')}`); failures++; }
      await shot(page, 'S-52-mark-popover');

      await click(page, 'S-52.chip.m5');
      await page.waitForFunction((c) => {
        const el = document.querySelector(`[data-cell="0:${c}"]`);
        return el && el.textContent.trim().includes('5');
      }, todayCol - 1, { timeout: 20_000 });
      console.log('    ✅ отметка 5 выставлена через интерфейс');
      const avg = (await page.locator('[data-testid="S-50.col.average"]').first().innerText()).trim();
      if (avg.startsWith('5')) console.log(`    ✅ S-50.col.average пересчитан: ${avg} (AR-115)`);
      else { console.error(`    ❌ средний балл после единственной пятёрки: «${avg}»`); failures++; }

      // Перезагрузка — единственный честный ответ на вопрос «а записалось ли».
      await page.reload();
      await page.waitForSelector('[data-testid="S-50.table"]', { timeout: 30_000 });
      const saved = (await cellOf(0).innerText()).trim();
      if (saved.includes('5')) console.log('    ✅ отметка пережила перезагрузку — записана на сервере');
      else { console.error(`    ❌ после перезагрузки в ячейке «${saved}»`); failures++; }
      await shot(page, 'S-50-mark-saved');

      // ── S-51 · тема урока ──
      console.log('▶ S-51 · тема урока');
      await page.locator('table[data-testid="S-50.table"] thead th').nth(todayCol).locator('[data-testid="S-50.colhead.date"]').click();
      await page.waitForSelector('[data-testid="S-51.input.topic"]', { timeout: 20_000 });
      await hasAll(page, ['S-51.input.topic', 'S-51.btn.save', 'S-51.meta']);
      await fill(page, 'S-51.input.topic', 'Сложение и вычитание');
      await shot(page, 'S-51-topic');
      await click(page, 'S-51.btn.save');
      await page.waitForSelector('[data-testid="S-51.input.topic"]', { state: 'detached', timeout: 20_000 });
      await page.reload();
      await page.waitForSelector('[data-testid="S-50.table"]', { timeout: 30_000 });
      await page.locator('table[data-testid="S-50.table"] thead th').nth(todayCol).locator('[data-testid="S-50.colhead.date"]').click();
      await page.waitForSelector('[data-testid="S-51.input.topic"]', { timeout: 20_000 });
      const topic = await page.locator('[data-testid="S-51.input.topic"]').inputValue();
      if (topic === 'Сложение и вычитание') console.log('    ✅ тема урока записана на сервере');
      else { console.error(`    ❌ тема после перезагрузки: «${topic}»`); failures++; }
      // §0: слой закрывается `Esc`. Проверяется здесь, а не «подразумевается»:
      // обработчик висит на слое и срабатывает, только если фокус внутри него.
      const focusInside = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="S-51"]')));
      if (focusInside) console.log('    ✅ фокус внутри поповера — ловушка фокуса и Esc имеют на чём работать');
      else { console.error('    ❌ фокус остался снаружи поповера: Esc и Tab-ловушка не работают'); failures++; }
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid="S-51"]', { state: 'detached', timeout: 10_000 });
      console.log('    ✅ Esc закрывает поповер темы (§0)');

      // ── S-52.btn.clear · снятие отметки — единственный способ её стереть ──
      console.log('▶ S-52.btn.clear · снятие отметки');
      await cellOf(0).click();
      await page.waitForSelector('[data-testid="S-52.btn.clear"]', { timeout: 20_000 });
      await click(page, 'S-52.btn.clear');
      await page.waitForFunction((c) => {
        const el = document.querySelector(`[data-cell="0:${c}"]`);
        return el && el.textContent.trim() === '';
      }, todayCol - 1, { timeout: 20_000 });
      const avgAfter = (await page.locator('[data-testid="S-50.col.average"]').first().innerText()).trim();
      if (avgAfter === '—') console.log('    ✅ отметка снята, средний балл вернулся к «—», а не к нулю (P7)');
      else { console.error(`    ❌ средний балл после снятия единственной отметки: «${avgAfter}»`); failures++; }
      await shot(page, 'S-52-mark-cleared');

      // ── S-40.banner.stale · правка нагрузки после подтверждения ──
      // Плашка «устарело» — не украшение: она отделяет подтверждённую сетку от
      // той, под которой изменились входные данные (AR-85). Проверяется тем же
      // путём, каким её увидит модератор: правкой часов в мастере.
      console.log('▶ S-40.banner.stale · правка нагрузки роняет сетку в «устарело»');
      await page.goto(`${WEB}/schedule`);
      await page.waitForSelector('[data-testid="S-40.grid.week"]', { timeout: 30_000 });
      await click(page, 'S-40.btn.setup');
      await page.waitForSelector('[data-testid="M-08"]', { timeout: 20_000 });
      await click(page, 'S-41.btn.next1');
      await page.waitForSelector('[data-testid="S-41.input.hours"]', { timeout: 20_000 });
      await page.locator('[data-testid="S-41.input.hours"]').first().fill('3');
      await click(page, 'S-41.btn.next2');
      await page.waitForSelector('[data-testid="S-41.chips.priority"]', { timeout: 20_000 });
      // Выход из мастера с введёнными данными спрашивает подтверждение (M-14).
      // `Esc` обязан работать и на ТРЕТЬЕМ шаге: кнопка, на которой был фокус,
      // размонтировалась вместе с предыдущим шагом (§0, ловушка фокуса).
      const focusInModal = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="M-08"]')));
      if (focusInModal) console.log('    ✅ фокус остался внутри мастера после смены шага');
      else { console.error('    ❌ фокус ушёл из мастера при смене шага: Esc и Tab-ловушка не работают'); failures++; }
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid="M-14"]', { timeout: 20_000 });
      await has(page, 'M-14', 'выход из мастера с введёнными данными спрашивает подтверждение');
      await shot(page, 'M-14-exit-wizard');
      await page.locator('[data-testid="M-14"] button', { hasText: 'Закрыть без сохранения' }).click();
      await page.goto(`${WEB}/schedule`);
      await page.waitForSelector('[data-testid="S-40.banner.stale"]', { timeout: 30_000 });
      await hasAll(page, ['S-40.banner.stale', 'S-40.btn.regenerate']);
      await shot(page, 'S-40-stale');
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

    // ── Оболочка глазами педагога: кнопка вне роли не рендерится (AR-69) ──
    // Проверяется на ЖИВОЙ сессии второй роли, а не на словах: сессия педагога
    // уже есть — её выдала регистрация по QR выше.
    console.log('▶ оболочка педагога · права видны по составу элементов');
    await phone.goto(`${WEB}/journal`);
    await phone.waitForSelector('[data-testid="L.sidebar"]', { timeout: 30_000 });
    const admin = await phone.locator('[data-testid="L.sidebar.item.admin"]').count();
    if (admin === 0) console.log('    ✅ «Кабинет» у педагога ОТСУТСТВУЕТ, а не «серый и некликабельный» (AR-69)');
    else { console.error('    ❌ педагог видит раздел «Кабинет»'); failures++; }
    const scan = await phone.locator('[data-testid="L.topbar.scan"]').count();
    if (scan === 1) console.log('    ✅ L.topbar.scan виден педагогу (модератор показывает коды, а не сканирует)');
    else { console.error(`    ❌ кнопок сканера в шапке педагога ${scan}, ожидалась одна`); failures++; }
    await hasAll(phone, ['L.sidebar', 'L.sidebar.logo', 'L.sidebar.user', 'L.sidebar.collapse', 'L.topbar.title']);
    await shot(phone, 'shell-teacher');

    // ── S-70 · сканер: на десктопе — причина, а не заглушка ──
    console.log('▶ S-70 · сканер (десктоп)');
    await phone.goto(`${WEB}/scan`);
    await phone.waitForSelector('[data-testid="S-70.hint.desktop"], [data-testid="S-70.viewfinder"], [data-testid="S-70.error.denied"]');
    await has(phone, 'S-70.hint.desktop', 'на десктопе сканер объясняет причину, а не показывает заглушку');
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
