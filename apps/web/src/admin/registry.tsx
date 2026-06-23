import type { ComponentType } from "react";
import type { IconName } from "./ds/Icon";
import { DevicesScreen, GeneralSettingsScreen, SecurityScreen, PermissionsScreen } from "./screens/school";
import { AllUsersScreen, UserProfileScreen, UserManagementScreen } from "./screens/users";
import { SubscriptionScreen, PaymentScreen, SeatsScreen } from "./screens/license";
import { ServicesScreen, IntegrationSettingsScreen } from "./screens/integrations";
import { AutoReportsScreen, ReportJournalScreen } from "./screens/reporting";
import { BackupsScreen, RestoreScreen } from "./screens/backups";
import { StructureScreen } from "@/structure/StructureScreen";

export interface AdminSubsection {
  id: string;
  label: string;
  Screen: ComponentType;
}
export interface AdminSection {
  id: string;
  label: string;
  icon: IconName;
  gradient: [string, string];
  subsections: AdminSubsection[];
}

/**
 * РЕЕСТР кабинета школьного администратора — единственная точка регистрации.
 * Новый раздел/подраздел = одна запись здесь + экран. Оболочка сама строит
 * левый сайдбар (разделы), правый сайдбар (подразделы) и рабочий экран.
 */
export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: "school", label: "Школа", icon: "building-2", gradient: ["#2563EB", "#5B8DEF"],
    subsections: [
      { id: "structure", label: "Классы и подгруппы", Screen: StructureScreen },
      { id: "devices", label: "Сеть устройств", Screen: DevicesScreen },
      { id: "general", label: "Общие настройки", Screen: GeneralSettingsScreen },
      { id: "security", label: "Безопасность", Screen: SecurityScreen },
      { id: "permissions", label: "Разрешения", Screen: PermissionsScreen },
    ],
  },
  {
    id: "users", label: "Пользователи", icon: "users", gradient: ["#F0883E", "#F7B267"],
    subsections: [
      { id: "all", label: "Все пользователи", Screen: AllUsersScreen },
      { id: "profile", label: "Профиль", Screen: UserProfileScreen },
      { id: "manage", label: "Управление", Screen: UserManagementScreen },
    ],
  },
  {
    id: "license", label: "Лицензия", icon: "credit-card", gradient: ["#16A34A", "#54C57E"],
    subsections: [
      { id: "subscription", label: "Подписка", Screen: SubscriptionScreen },
      { id: "payment", label: "Оплата", Screen: PaymentScreen },
      { id: "seats", label: "Места", Screen: SeatsScreen },
    ],
  },
  {
    id: "integrations", label: "Интеграции", icon: "plug", gradient: ["#0EA5A5", "#34C7B5"],
    subsections: [
      { id: "services", label: "Сервисы", Screen: ServicesScreen },
      { id: "settings", label: "Настройки", Screen: IntegrationSettingsScreen },
    ],
  },
  {
    id: "reporting", label: "Отчётность", icon: "bar-chart-3", gradient: ["#7C5CFC", "#A98BFF"],
    subsections: [
      { id: "auto", label: "Автоотчёты", Screen: AutoReportsScreen },
      { id: "journal", label: "Журнал", Screen: ReportJournalScreen },
    ],
  },
  {
    id: "backups", label: "Резервные копии", icon: "database", gradient: ["#E0567E", "#F58BA8"],
    subsections: [
      { id: "backups", label: "Бэкапы", Screen: BackupsScreen },
      { id: "restore", label: "Восстановление", Screen: RestoreScreen },
    ],
  },
];
