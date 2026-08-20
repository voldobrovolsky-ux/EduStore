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
  ['ready','stale','правка данных после подтверждения','moderator'],
  ['stale','generated','регенерация','moderator'],
  ['stale','stale','продолжение правок','moderator'],
  // возвраты для правки пройденных шагов (мастер — не замок, AR-72)
  ['terms_set','terms_set','правка дат до материализации','moderator'],
  ['load_set','load_set','правка часов','moderator'],
  ['priorities_set','priorities_set','правка списка','moderator'],
];
