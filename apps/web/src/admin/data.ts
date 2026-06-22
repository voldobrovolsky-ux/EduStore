// Демо-данные кабинета школьного администратора (UI-слой; бэкенд — следующий шаг).
import type { IconName } from "./ds/Icon";

export const SCHOOL = {
  name: "Гимназия №5",
  address: "г. Владивосток, ул. Светланская, 14",
  inn: "2540012345",
  timezone: "Asia/Vladivostok (UTC+10)",
  lang: "Русский",
};

export const ROLES = ["Директор", "Завуч", "Учитель", "Психолог", "Соцпедагог", "Родитель", "Ученик"];

export interface Device {
  id: string; name: string; room: string; type: "monitor" | "laptop" | "tablet" | "smartphone";
  status: "online" | "offline"; lastActivity: string;
}
export const DEVICES: Device[] = [
  { id: "d1", name: "ПК кабинета 214", room: "каб. 214 · Математика", type: "monitor", status: "online", lastActivity: "сейчас" },
  { id: "d2", name: "Ноутбук завуча", room: "Учительская", type: "laptop", status: "online", lastActivity: "5 мин назад" },
  { id: "d3", name: "Планшет психолога", room: "каб. 103 · Психолог", type: "tablet", status: "offline", lastActivity: "2 ч назад" },
  { id: "d4", name: "ПК библиотеки", room: "Библиотека", type: "monitor", status: "online", lastActivity: "12 мин назад" },
  { id: "d5", name: "Телефон директора", room: "Приёмная", type: "smartphone", status: "online", lastActivity: "сейчас" },
  { id: "d6", name: "Ноутбук каб. 305", room: "каб. 305 · Информатика", type: "laptop", status: "offline", lastActivity: "вчера" },
];

export interface AdminUser {
  id: string; name: string; role: string; devices: number; lastActivity: string; status: "active" | "inactive";
}
export const USERS: AdminUser[] = [
  { id: "u1", name: "Кравцова Елена", role: "Директор", devices: 2, lastActivity: "сейчас", status: "active" },
  { id: "u2", name: "Соколова Анна", role: "Учитель", devices: 1, lastActivity: "8 мин назад", status: "active" },
  { id: "u3", name: "Лазарев Дмитрий", role: "Психолог", devices: 1, lastActivity: "1 ч назад", status: "active" },
  { id: "u4", name: "Гордеева Анна", role: "Соцпедагог", devices: 1, lastActivity: "вчера", status: "active" },
  { id: "u5", name: "Минина Ольга", role: "Завуч", devices: 2, lastActivity: "30 мин назад", status: "active" },
  { id: "u6", name: "Петров Степан", role: "Учитель", devices: 1, lastActivity: "3 дн назад", status: "inactive" },
];

export const LOGIN_JOURNAL = [
  { user: "Кравцова Елена", device: "Телефон директора", time: "сегодня, 09:02", status: "success" as const },
  { user: "Соколова Анна", device: "ПК кабинета 214", time: "сегодня, 08:41", status: "success" as const },
  { user: "неизвестно", device: "Веб · Chrome", time: "сегодня, 07:55", status: "fail" as const },
  { user: "Минина Ольга", device: "Ноутбук завуча", time: "вчера, 17:20", status: "success" as const },
];

export const PERM_ACTIONS = ["Просмотр", "Редактирование", "Удаление", "Экспорт"];
export type PermState = "allow" | "view" | "deny";
// матрица роль → действие → состояние (демо: разумные дефолты)
export const PERMISSIONS: Record<string, PermState[]> = {
  Директор: ["allow", "allow", "allow", "allow"],
  Завуч: ["allow", "allow", "deny", "allow"],
  Учитель: ["allow", "allow", "deny", "view"],
  Психолог: ["view", "allow", "deny", "deny"],
  Соцпедагог: ["view", "allow", "deny", "deny"],
};

export const LICENSE = {
  tariff: "EduStore Full",
  renewal: "1 сентября 2027",
  price: "от 39 000 ₽ / год",
  modules: [
    { name: "LMS · Журнал и ПП", active: true },
    { name: "Авторасписание", active: true },
    { name: "Кабинет психолога", active: true },
    { name: "Родительский портал", active: true },
    { name: "Communitoria", active: true },
    { name: "Flōr Office", active: false },
    { name: "Предиктивная аналитика", active: false },
  ],
};

export const PAYMENTS = [
  { date: "01.09.2026", amount: "47 000 ₽", method: "Счёт · банк. перевод", status: "paid" as const },
  { date: "01.09.2025", amount: "39 000 ₽", method: "Счёт · банк. перевод", status: "paid" as const },
  { date: "15.08.2025", amount: "0 ₽", method: "Промо · первый месяц", status: "paid" as const },
];

export const SEATS = [
  { role: "Учителя", used: 48, total: 60 },
  { role: "Ученики", used: 812, total: 1000 },
  { role: "Специалисты", used: 4, total: 6 },
  { role: "Администраторы", used: 2, total: 3 },
];

export interface Integration {
  id: string; name: string; icon: IconName; status: "active" | "error" | "off"; desc: string;
}
export const INTEGRATIONS: Integration[] = [
  { id: "comm", name: "Communitoria", icon: "message-circle", status: "active", desc: "Мессенджер · каналы классов" },
  { id: "flor", name: "Flōr Office", icon: "file-text", status: "off", desc: "Офисный пакет · документы уроков" },
  { id: "ygpt", name: "YandexGPT", icon: "sparkles", status: "active", desc: "Генерация материалов" },
  { id: "print", name: "Принтеры", icon: "printer", status: "error", desc: "Печать работ и отчётов" },
  { id: "s3", name: "S3-хранилище", icon: "hard-drive", status: "active", desc: "Yandex Object Storage · файлы" },
];

export const AUTO_REPORTS = [
  { name: "Сводка успеваемости", to: "Директор, Завуч", frequency: "Еженедельно", format: "PDF", enabled: true },
  { name: "Прохождение программы", to: "Завуч", frequency: "Ежемесячно", format: "XLSX", enabled: true },
  { name: "Посещаемость", to: "Директор", frequency: "Ежедневно", format: "PDF", enabled: false },
];
export const REPORT_LOG = [
  { name: "Сводка успеваемости", date: "16.06, 08:00", recipient: "Директор, Завуч", status: "sent" as const },
  { name: "Прохождение программы", date: "01.06, 09:00", recipient: "Завуч", status: "sent" as const },
  { name: "Посещаемость", date: "15.06, 08:00", recipient: "Директор", status: "fail" as const },
];

export const BACKUPS = {
  schedule: "Ежедневно, 03:00 (Asia/Vladivostok)",
  lastSuccess: "сегодня, 03:00 · 1.4 ГБ",
  history: [
    { date: "17.06, 03:00", status: "ok" as const, size: "1.4 ГБ" },
    { date: "16.06, 03:00", status: "ok" as const, size: "1.4 ГБ" },
    { date: "15.06, 03:00", status: "ok" as const, size: "1.3 ГБ" },
    { date: "14.06, 03:00", status: "fail" as const, size: "—" },
  ],
};
export const RESTORE_HISTORY = [
  { date: "02.05.2026", by: "Кравцова Елена", status: "ok" as const },
];
