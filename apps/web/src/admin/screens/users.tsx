import { useState } from "react";
import { Icon } from "../ds/Icon";
import { Avatar, Badge, Button, Select } from "../ds/components";
import { WorkHead, Panel } from "./_shared";
import { ROLES, USERS } from "../data";

export function AllUsersScreen() {
  const [role, setRole] = useState("");
  const rows = USERS.filter((u) => !role || u.role === role);
  return (
    <div>
      <WorkHead
        title="Все пользователи"
        sub={`${USERS.length} учётных записей`}
        actions={<div style={{ width: 200 }}><Select size="sm" placeholder="Все роли" value={role} onChange={(e) => setRole(e.target.value)} options={["", ...ROLES].map((r) => ({ value: r, label: r || "Все роли" }))} /></div>}
      />
      <Panel>
        <table className="adm-table">
          <thead><tr><th>Пользователь</th><th>Роль</th><th>Устройства</th><th>Активность</th><th>Статус</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><span style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={u.name} size="sm" /><span style={{ color: "var(--text-strong)", fontWeight: 500 }}>{u.name}</span></span></td>
                <td><Badge tone="accent">{u.role}</Badge></td>
                <td>{u.devices}</td>
                <td style={{ color: "var(--text-muted)" }}>{u.lastActivity}</td>
                <td><Badge tone={u.status === "active" ? "create" : "neutral"} dot>{u.status === "active" ? "активен" : "неактивен"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export function UserProfileScreen() {
  const u = USERS[1];
  return (
    <div style={{ maxWidth: 640 }}>
      <WorkHead title="Профиль пользователя" sub="Карточка учётной записи" />
      <Panel style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Avatar name={u.name} size="lg" />
          <div>
            <h2 style={{ fontSize: "var(--text-xl)" }}>{u.name}</h2>
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}><Badge tone="accent">{u.role}</Badge><Badge tone={u.status === "active" ? "create" : "neutral"} dot>{u.status === "active" ? "активен" : "неактивен"}</Badge></div>
          </div>
        </div>
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[["Устройств", String(u.devices)], ["Роль", u.role], ["Активность", u.lastActivity]].map(([k, v]) => (
            <div key={k} className="adm-stat"><div className="adm-stat__v" style={{ fontSize: "var(--text-md)" }}>{v}</div><div className="adm-stat__k">{k}</div></div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function UserManagementScreen() {
  const u = USERS[1];
  return (
    <div style={{ maxWidth: 640 }}>
      <WorkHead title="Управление доступом" sub={`${u.name} · ${u.role}`} />
      <Panel style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <div style={{ flex: 1 }}><Select label="Назначить роль" defaultValue={u.role} options={ROLES} /></div>
          <Button variant="create" icon={<Icon name="check" size={16} />}>Применить</Button>
        </div>
        <div style={{ display: "flex", gap: 12, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
          <Button variant="secondary" icon={<Icon name="rotate-ccw" size={16} />}>Сбросить доступ</Button>
          <Button variant="danger-soft" icon={<Icon name="power" size={16} />}>Деактивировать аккаунт</Button>
        </div>
      </Panel>
    </div>
  );
}
