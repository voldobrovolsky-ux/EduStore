import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@edustore/shared';

/**
 * Двадцать семь кодов отказа версии с текстами из `70-screens.md` §9.
 *
 * Правило: текст называет **объект и цифры**, а не «произошла ошибка». Поэтому
 * шаблоны здесь — функции от деталей отказа, а не константные строки: сообщение
 * «5 класс: 34 часа при потолке 29» человек может исполнить, «ошибка валидации» —
 * нет. Каждый ответ несёт `requestId` = correlationId (AR-21, AR-97).
 */
type D = Record<string, unknown>;
const n = (d: D, k: string): string => String(d[k] ?? '—');

const TEXTS: Record<ErrorCode, (d: D) => string> = {
  // страница входа перевыпускает QR сама — текстом отказ не показывается
  LINK_CODE_EXPIRED: () => 'Код на экране устарел — обновите страницу входа на подключаемом устройстве',
  TOKEN_USED: () => 'Код уже использован, откройте карточку заново',
  TOKEN_EXPIRED: () => 'Код погас, откройте карточку заново',
  PHONE_TAKEN_IN_SCHOOL: () => 'Этот номер уже зарегистрирован в школе',
  CLASSES_ALREADY_EXIST: () => 'Классы уже созданы; добавьте класс из списка',
  TERM_OVERLAP: (d) => `Четверти пересекаются: ${n(d, 'termNo')} четверть начинается раньше, чем кончается предыдущая`,
  TERM_REVERSED: (d) => `Дата конца раньше даты начала: ${n(d, 'termNo')} четверть`,
  LOAD_EXCEEDS_SANPIN: (d) => `${n(d, 'classLabel')} класс: ${n(d, 'total')} часа при потолке ${n(d, 'cap')} — СанПиН 1.2.3685-21`,
  LOAD_EXCEEDS_GRID: (d) => `${n(d, 'classLabel')} класс: ${n(d, 'total')} часов при ${n(d, 'grid')} слотах недели`,
  GROUP_HOURS_UNEQUAL: (d) => `${n(d, 'subject')}, ${n(d, 'classLabel')} класс: ${n(d, 'hours')}`,
  TEACHER_OVERBOOKED: (d) => `${n(d, 'teacher')}: ${n(d, 'hours')} часов при ${n(d, 'grid')} слотах недели`,
  SUBJECT_UNCOVERED: (d) => `${n(d, 'subject')}, ${n(d, 'classLabel')} класс: ${n(d, 'groups')} без педагога`,
  GROUPS_UNASSIGNED: (d) => `${n(d, 'classLabel')} класс: группы объявлены, состав не назначен`,
  DAY_EXCEEDS_SANPIN: (d) => `${n(d, 'classLabel')} класс: ${n(d, 'slotsPerDay')} уроков в день при потолке ${n(d, 'cap')} — СанПиН 1.2.3685-21`,
  // текст НЕ ссылается на СанПиН: потолок 420 минут — продуктовый дефолт (AR-103)
  DAY_TOO_LONG: (d) => `Учебный день ${n(d, 'minutes')} минут при потолке ${n(d, 'cap')}: ${n(d, 'breakdown')}`,
  CONCURRENT_EDIT: (d) => `Пока вы заполняли, ${n(d, 'editor')} изменила эти данные. Обновите экран`,
  NO_SOLUTION: () => 'Не удалось собрать сетку. Ослабьте приоритеты или добавьте учебный день',
  LESSON_NOT_HELD: () => 'Урок ещё не прошёл',
  LESSON_DETACHED: () => 'Урок вне расписания: отметки сохранены, изменить их нельзя',
  CLASS_HAS_MARKS: () => 'В классе есть выставленные отметки — класс не удаляется',
  LAST_MODERATOR: () => 'Это единственный модератор школы — удалить или деактивировать его нельзя',
  LAST_ROLE: () => 'Это единственная роль сотрудника — снять её нельзя; чтобы закрыть доступ, деактивируйте карточку',
  CALENDAR_YEAR_MISSING: (d) => `Нет производственного календаря на ${n(d, 'year')} год — обратитесь к администратору платформы`,
  LOGIN_CODE_INVALID: () => 'Неверный код',
  LOGIN_CODE_EXPIRED: () => 'Код истёк, попросите модератора открыть карточку заново',
  ACCESS_REVOKED: () => 'Доступ закрыт. Обратитесь к модератору школы',
  STUDENT_INACTIVE: () => 'Ученик деактивирован',
};

/** HTTP-статус отказа: 409 у конфликтов состояния, 403 у отзыва доступа, иначе 400. */
const STATUS: Partial<Record<ErrorCode, HttpStatus>> = {
  CONCURRENT_EDIT: HttpStatus.CONFLICT,
  CLASSES_ALREADY_EXIST: HttpStatus.CONFLICT,
  PHONE_TAKEN_IN_SCHOOL: HttpStatus.CONFLICT,
  CLASS_HAS_MARKS: HttpStatus.CONFLICT,
  LAST_MODERATOR: HttpStatus.CONFLICT,
  LAST_ROLE: HttpStatus.CONFLICT,
  TOKEN_USED: HttpStatus.GONE,
  TOKEN_EXPIRED: HttpStatus.GONE,
  LINK_CODE_EXPIRED: HttpStatus.GONE,
  LOGIN_CODE_EXPIRED: HttpStatus.GONE,
  ACCESS_REVOKED: HttpStatus.FORBIDDEN,
  LOGIN_CODE_INVALID: HttpStatus.UNAUTHORIZED,
};

/** Отказ версии: код + человекочитаемая причина с объектом и цифрами + requestId. */
export class SchoolError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly details: D = {},
    requestId = 'n/a',
  ) {
    super(
      { code, message: TEXTS[code](details), requestId, details },
      STATUS[code] ?? HttpStatus.BAD_REQUEST,
    );
  }
}

export const errorText = (code: ErrorCode, details: D = {}): string => TEXTS[code](details);

/** Перечисление для ворот: у каждого из 27 кодов есть непустой текст. */
export const ALL_ERROR_CODES = ERROR_CODES;
