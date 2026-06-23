import type { IconName } from "@/admin/ds/Icon";

// Минимальные кабинеты ролей: только навигация (разделы в сайдбаре) + главная.
// admin и teacher рендерятся отдельными готовыми кабинетами (см. main.tsx).
export type MinimalKey = "owner" | "zavuch" | "methodist" | "parent" | "student" | "psychologist";

export interface CabinetDef {
  label: string; // название кабинета
  roleLabel: string; // подпись роли
  gradient: [string, string];
  sections: { id: string; label: string; icon: IconName }[];
}

export const MINIMAL_CABINETS: Record<MinimalKey, CabinetDef> = {
  owner: {
    label: "Кабинет учредителя", roleLabel: "Учредитель", gradient: ["#2563EB", "#5B8DEF"],
    sections: [
      { id: "metrics", label: "Бизнес-метрики", icon: "bar-chart-3" },
      { id: "schools", label: "Школы", icon: "building-2" },
      { id: "license", label: "Лицензия", icon: "credit-card" },
    ],
  },
  zavuch: {
    label: "Кабинет завуча", roleLabel: "Завуч", gradient: ["#0EA5A5", "#34C7B5"],
    sections: [
      { id: "ktp", label: "КТП", icon: "ktp" },
      { id: "schedule", label: "Расписание", icon: "calendar-days" },
      { id: "teachers", label: "Учителя", icon: "users" },
    ],
  },
  methodist: {
    label: "Кабинет методиста", roleLabel: "Методист", gradient: ["#7C5CFC", "#A98BFF"],
    sections: [
      { id: "disciplines", label: "Дисциплины", icon: "book" },
      { id: "umk", label: "УМК", icon: "layers" },
      { id: "rp", label: "Рабочая программа", icon: "file-text" },
    ],
  },
  parent: {
    label: "Кабинет родителя", roleLabel: "Родитель", gradient: ["#F0883E", "#F7B267"],
    sections: [
      { id: "diary", label: "Дневник ребёнка", icon: "book" },
      { id: "grades", label: "Оценки", icon: "circle-check" },
      { id: "schedule", label: "Расписание", icon: "calendar-days" },
    ],
  },
  student: {
    label: "Кабинет ученика", roleLabel: "Ученик", gradient: ["#16A34A", "#54C57E"],
    sections: [
      { id: "tasks", label: "Задания", icon: "clipboard" },
      { id: "schedule", label: "Расписание", icon: "calendar-days" },
      { id: "progress", label: "Успеваемость", icon: "line-chart" },
    ],
  },
  psychologist: {
    // staff/психолог — спецификации разделов пока нет, минимальный набор по смыслу
    label: "Кабинет психолога", roleLabel: "Психолог", gradient: ["#E0567E", "#F58BA8"],
    sections: [
      { id: "cases", label: "Кейсы", icon: "file-text" },
      { id: "sessions", label: "Сессии", icon: "calendar-days" },
      { id: "risk", label: "Risk-карта", icon: "circle-alert" },
    ],
  },
};
