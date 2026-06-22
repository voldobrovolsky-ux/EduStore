import { Icon } from "../ds/Icon";
import { Badge, Button, Switch } from "../ds/components";
import { WorkHead, Panel } from "./_shared";
import { INTEGRATIONS, type Integration } from "../data";

const TONE: Record<Integration["status"], "create" | "danger" | "neutral"> = { active: "create", error: "danger", off: "neutral" };
const LABEL: Record<Integration["status"], string> = { active: "активен", error: "ошибка", off: "отключён" };

export function ServicesScreen() {
  return (
    <div>
      <WorkHead title="Сервисы" sub="Подключённые внешние сервисы и интеграции" />
      <div className="adm-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
        {INTEGRATIONS.map((s) => (
          <Panel key={s.id} style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <span style={{ width: 44, height: 44, borderRadius: 13, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", background: "var(--accent-tint)" }}><Icon name={s.icon} size={22} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: "var(--text-md)" }}>{s.name}</div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{s.desc}</div>
              </div>
              <Badge tone={TONE[s.status]} dot>{LABEL[s.status]}</Badge>
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm" icon={<Icon name="settings" size={15} />}>Настроить</Button>
              <Button variant="ghost" size="sm" icon={<Icon name="power" size={15} />}>{s.status === "off" ? "Включить" : "Отключить"}</Button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

export function IntegrationSettingsScreen() {
  const s = INTEGRATIONS[0];
  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
      <WorkHead title="Настройки интеграции" sub={s.name} />
      <Panel style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", background: "var(--accent-tint)" }}><Icon name={s.icon} size={20} /></span>
            <div><div style={{ fontWeight: 600, color: "var(--text-strong)" }}>{s.name}</div><div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{s.desc}</div></div>
          </div>
          <Badge tone={TONE[s.status]} dot>{LABEL[s.status]}</Badge>
        </div>
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 12 }}>
          <Switch checked label="Автосинхронизация классов в каналы" />
          <Switch checked label="Уведомления о заданиях" />
          <Switch label="Тихий режим в нерабочее время" />
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          <Button variant="create" icon={<Icon name="check" size={16} />}>Сохранить</Button>
          <Button variant="danger-soft" icon={<Icon name="power" size={16} />}>Отключить</Button>
        </div>
      </Panel>
    </div>
  );
}
