// FSM онбординга по 30-spec.md — данные, не код (детектор L-2)
export const states = [
  'empty','classes_created','students_filled','subjects_created','staff_activated',
  'teachers_bound','terms_set','load_set','priorities_set','day_params_set',
  'generated','stale','ready',
];
export const initial = 'empty';
export const terminals = ['ready'];
export const home = {
  empty:'Классы (пустое состояние)', classes_created:'Классы', students_filled:'карточка класса',
  subjects_created:'Предметы', staff_activated:'Персонал', teachers_bound:'Предметы',
  terms_set:'модалка, экран 1', load_set:'модалка, экран 2', priorities_set:'модалка, экран 3',
  day_params_set:'модалка, экран 4', generated:'Расписание (предпросмотр)',
  stale:'Расписание (плашка)', ready:'Журнал',
};
export const transitions = [
  ['empty','classes_created','мастер классов','moderator'],
  ['classes_created','students_filled','заполнение ФИО/пола','moderator'],
  ['classes_created','classes_created','правка/удаление класса без учеников','moderator'],
  ['students_filled','subjects_created','создание предметов','moderator'],
  ['students_filled','students_filled','добавить/редактировать/деактивировать ученика','moderator'],
  ['subjects_created','staff_activated','QR-активация персонала','moderator+staff'],
  ['subjects_created','subjects_created','правка предмета без педагога','moderator'],
  ['staff_activated','teachers_bound','QR-привязка педагогов','moderator+teacher'],
  ['staff_activated','staff_activated','добавить сотрудника/роль','moderator'],
  ['teachers_bound','terms_set','ввод четвертей → календарь','moderator'],
  ['teachers_bound','teachers_bound','перепривязка педагога','moderator'],
  ['terms_set','load_set','ввод нагрузки','moderator'],
  ['load_set','priorities_set','приоритеты или явный отказ «без»','moderator'],
  ['priorities_set','day_params_set','параметры дня в границах СанПиН','moderator'],
  ['day_params_set','generated','генерация (успех)','system-proposes'],
  ['day_params_set','day_params_set','отказ генератора: правка входа','moderator'],
  ['generated','ready','подтверждение сетки (человек решает)','moderator'],
  ['generated','generated','регенерация с другим зерном','moderator'],
  ['generated','day_params_set','возврат на правку входа','moderator'],
  ['ready','stale','правка, влияющая на сетку (см. editEffects)','moderator'],
  ['ready','ready','правка контингента: сетка не пересобирается','moderator'],
  ['stale','generated','регенерация','moderator'],
  ['stale','stale','продолжение правок','moderator'],
  // возвраты для правки пройденных шагов (мастер — не замок, AR-72)
  ['terms_set','terms_set','правка дат до материализации','moderator'],
  ['load_set','load_set','правка часов','moderator'],
  ['priorities_set','priorities_set','правка списка','moderator'],
];

// Таксономия правок после подтверждения сетки (30-spec «Жизненный цикл сетки», AR-85).
// [что правит модератор, влияет ли на сетку, состояние школы после правки]
export const editEffects = [
  ['добавить ученика',                    false, 'ready'],
  ['редактировать профиль ученика',       false, 'ready'],
  ['деактивировать ученика',              false, 'ready'],
  ['перевести ученика между группами',    false, 'ready'],
  ['создать класс',                       true,  'stale'],
  ['изменить число групп в классе',       true,  'stale'],
  ['создать предмет',                     true,  'stale'],
  ['привязать педагога к предмету',       true,  'stale'],
  ['открепить педагога',                  true,  'stale'],
  ['изменить часы нагрузки',              true,  'stale'],
  ['изменить приоритеты',                 true,  'stale'],
  ['изменить параметры дня',              true,  'stale'],
  ['изменить даты четвертей',             true,  'stale'],
  ['реактивировать ученика',              false, 'ready'],
  ['удалить класс',                       true,  'stale'],
  ['удалить предмет',                     true,  'stale'],
  ['удалить сотрудника',                  true,  'stale'],
  ['деактивировать сотрудника',           true,  'stale'],
  ['снять роль у сотрудника',             false, 'ready'],
  ['реактивировать сотрудника',           false, 'ready'],
];

// Что происходит с материализованными уроками при повторном подтверждении сетки.
// 'detach-marked': урок с отметками отвязывается от шаблона и остаётся колонкой
// журнала с пометкой; урок без отметок исчезает вместе со старым шаблоном.
export const regenerationPolicy = 'detach-marked';

// Границы мастера классов, которые нельзя вывести из диапазонов полей.
export const wizard = {
  parallels: [1, 11],
  students: [1, 40],
  groups: [2, 4],
  // групп не больше, чем учеников: иначе класс получает группу без единого ученика
  groupsFit: (students, groups) => groups === null || (groups >= 2 && groups <= 4 && groups <= students),
};

// Полномочия ролей (AR-88). Модератор школы — полные права внутри своей школы:
// любая мутация версии, включая отметки в чужих уроках. Остальные роли читают;
// педагог пишет отметки и темы в уроках, к которым привязан.
export const rights = {
  moderator: 'all',
  teacher: 'own-lessons',
  founder: 'read',
  director: 'read',
  deputy_academic: 'read',
  deputy_upbringing: 'read',
};

// Гейт отметки: сперва полномочия, затем гейт реальности. Полные права не
// отменяют второго: непроведённый урок закрыт для всех, потому что это факт
// календаря, а не уровень доступа (AR-74).
export const markGate = (roles, userId, lesson, today) => {
  const may = roles.some((r) => rights[r] === 'all')
    || (roles.includes('teacher') && rights.teacher === 'own-lessons' && lesson.teacherId === userId);
  if (!may) return 'FORBIDDEN';
  if (lesson.date > today) return 'LESSON_NOT_HELD';
  return 'ok';
};

// Обратимость операций (AR-90): [операция, обратная, причина отсутствия обратной].
// Пустое в обеих последних колонках — дефект: операция без выхода назад и без
// объяснения, почему выхода нет.
export const reversals = [
  ['войти по коду',                'выйти из сессии', ''],
  ['зарегистрировать сотрудника',  'удалить либо деактивировать сотрудника', ''],
  ['загрузить аватар',             'удалить аватар', ''],
  ['добавить роль',                'снять роль', ''],
  ['создать класс',                'удалить класс (пока ни у кого из учеников нет отметок)', ''],
  ['добавить ученика',             'удалить ученика без отметок, деактивировать с отметками', ''],
  ['деактивировать ученика',       'реактивировать ученика', ''],
  ['деактивировать сотрудника',    'реактивировать сотрудника', ''],
  ['создать предмет',              'удалить предмет', ''],
  ['привязать педагога',           'открепить педагога', ''],
  ['выдать QR активации',          'закрыть карточку — код гаснет', ''],
  ['запустить генерацию',          'отменить генерацию', ''],
  ['подтвердить сетку',            'регенерация с новым зерном', 'отката к прежнему шаблону нет: подтверждённая сетка уже материализована в даты, и «вернуть как было» означало бы вторую пересборку уроков; путь вперёд — регенерация'],
  ['поставить отметку',            'снять отметку', ''],
  ['задать тему урока',            'заменить текст темы', 'снятия темы нет: пустая тема и отсутствие темы — одно состояние'],
  ['задать четверти',              'изменить даты четвертей', ''],
  ['материализовать урок',         '', 'обратной операции у человека нет: уроки материализует движок, отвязка происходит внутри регенерации (AR-85)'],
  ['удалить ученика',              '', 'необратимо по построению: удаление доступно только для записи без отметок — цена ошибки равна повторному вводу ФИО'],
  ['удалить сотрудника',           '', 'необратимо по построению: удаление доступно только сотруднику без привязок и без выставленных отметок; сотрудник с историей деактивируется, а деактивация обратима'],
];

// Удаление и деактивация сотрудника (AR-89): что решает сервер до показа кнопки.
export const staffRemoval = (person, school) => {
  const isModerator = person.roles.includes('moderator');
  if (isModerator && school.moderators <= 1)
    return { code: 'LAST_MODERATOR', action: 'refuse' };
  if (person.hasHistory)
    return { action: 'deactivate', keepsMarks: true, unbinds: true, staleSchedule: true };
  return { action: 'delete', keepsMarks: true, unbinds: true, staleSchedule: true };
};

// Маршруты входа сотрудника (AR-91, AR-93, AR-94). SMS-контура нет: вход
// держится на якорной сессии телефона (90 дней) и привязке устройств по QR
// (паттерн Telegram); восстановление — код с карточки у модератора.
export const loginRoute = (ctx) => {
  const c = { justRegistered:false, ownDevice:true, hasAnchorSession:false,
              newDevice:false, moderatorPresent:false, deactivated:false,
              bootstrap:false, lastModeratorNoSession:false, ...ctx };
  if (c.deactivated)
    return { route:'none', revokesSessions:true,
             reason:'доступ закрыт деактивацией: активные сессии отозваны, новые маршруты не выдаются' };
  if (c.bootstrap)
    return { route:'bootstrap-link',
             reason:'первый модератор школы заводится платформенной операцией и входит по одноразовой ссылке (24 часа)' };
  if (c.lastModeratorNoSession)
    return { route:'bootstrap-relink',
             reason:'единственный модератор без единой живой сессии — платформа перевыпускает одноразовую ссылку той же командой; школа не запирается навсегда' };
  if (c.justRegistered && c.ownDevice)
    return { route:'session-from-registration',
             reason:'регистрация прошла на устройстве сотрудника при живой сессии модератора — сессия 90 дней выдаётся сразу, телефон становится якорным устройством' };
  if (c.hasAnchorSession)
    return { route:'device-link',
             reason:'новое устройство открывает /login и показывает QR; телефон сканирует его из «Настройки → Подключить устройство» — сессия выдаётся сразу' };
  if (c.moderatorPresent)
    return { route:'login-code',
             reason:'якорной сессии нет: одноразовый код с карточки сотрудника — QR для камеры, шесть цифр для набора руками' };
  return { route:'none',
           reason:'живой сессии нет ни на одном устройстве — обратитесь к модератору школы, он выдаст код входа' };
};

// FSM привязки устройства (AR-94): токен со страницы входа нового устройства.
// waiting → approved (скан якорным устройством) | expired (TTL) ; одноразов.
export const deviceLink = {
  ttlMinutes: 3,
  approve({ token, scanner }) {
    if (scanner.deactivated) return { code:'ACCESS_REVOKED' };
    if (token.state === 'approved') return { code:'TOKEN_USED' };
    if (token.state === 'expired') return { code:'LINK_CODE_EXPIRED' };
    // сессия нового устройства — копия контекста сканирующего: та же школа, те же роли
    return { ok:true, session:{ workspaceId: scanner.workspaceId, roles: scanner.roles } };
  },
  revoke({ session }) { return { only: session.id }; },
};

// Календарь нерабочих дней (AR-100). Источник — справочник производственного
// календаря РФ, версионируемый в коде по учебным годам; отсутствие года не
// «пропускается молча», а становится именованным отказом генерации.
const NON_WORKING = {
  2026: ['2026-01-01','2026-01-02','2026-01-05','2026-01-06','2026-01-07','2026-01-08',
         '2026-02-23','2026-03-09','2026-05-01','2026-05-11','2026-06-12','2026-11-04'],
  2027: ['2027-01-01','2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08',
         '2027-02-23','2027-03-08','2027-05-03','2027-05-10','2027-06-14','2027-11-04'],
};
export const calendar = {
  nonWorking: (year) => NON_WORKING[year] ?? [],
  check: (year) => (NON_WORKING[year] ? { ok: true } : { code: 'CALENDAR_YEAR_MISSING', year }),
};

// Скользящая материализация (AR-101): идемпотентная операция «дозаполнить
// горизонт», а не разовое событие. Идемпотентность и даёт право на три триггера.
export const materialize = ({ from, weeks, perDay, existing = [] }) => {
  const seen = new Set(existing.map((l) => `${l.date}:${l.slot}`));
  const lessons = [...existing];
  let created = 0;
  const start = new Date(from);
  for (let i = 0; i < weeks * 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getDay() + 6) % 7;
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    if (calendar.nonWorking(d.getFullYear()).includes(iso)) continue;
    for (const u of perDay[dow] ?? []) {
      const key = `${iso}:${u.slot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lessons.push({ date: iso, ...u });
      created += 1;
    }
  }
  return { lessons, created };
};
materialize.triggers = ['подтверждение сетки', 'ночной крон', 'открытие журнала с коротким горизонтом'];

// Смена ролей сотрудника (AR-102). Роль модератора выдаётся и снимается той же
// кнопкой «Добавить роль»; школа защищена от потери последнего модератора,
// сотрудник — от потери последней роли (для закрытия доступа есть деактивация).
export const roleChange = ({ op, role, person, school }) => {
  const roles = [...person.roles];
  if (op === 'add') {
    if (!roles.includes(role)) roles.push(role);
    return { ok: true, roles };
  }
  if (role === 'moderator' && school.moderators <= 1) return { code: 'LAST_MODERATOR' };
  if (roles.length <= 1) return { code: 'LAST_ROLE' };
  return { ok: true, roles: roles.filter((r) => r !== role) };
};
