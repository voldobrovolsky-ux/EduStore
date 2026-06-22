import { useState } from "react";
import { Icon } from "../ds/Icon";
import { Badge, Button, Input, Select, Switch } from "../ds/components";
import { WorkHead, Panel } from "./_shared";
import { DEVICES, LOGIN_JOURNAL, PERMISSIONS, PERM_ACTIONS, ROLES, SCHOOL, type Device, type PermState } from "../data";

const DEVICE_TINT: Record<Device["type"], string> = { monitor: "#2563EB", laptop: "#0EA5A5", tablet: "#7C5CFC", smartphone: "#F0883E" };

export function DevicesScreen() {
  const [qr, setQr] = useState(false);
  return (
    <div>
      <WorkHead
        title="Сеть устройств"
        sub={`${DEVICES.filter((d) => d.status === "online").length} онлайн из ${DEVICES.length}`}
        actions={<Button variant="create" icon={<Icon name="qr-code" size={16} />} onClick={() => setQr((v) => !v)}>Подключить устройство</Button>}
      />
      {qr && (
        <Panel style={{ padding: 22, marginBottom: 16, display: "flex", gap: 20, alignItems: "center" }}>
          <FakeQR />
          <div>
            <h3 style={{ marginBottom: 6 }}>Сканируйте код в приложении EduStore</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>Код действует 10 минут. Устройство появится в сети после подтверждения.</p>
          </div>
        </Panel>
      )}
      <div className="adm-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {DEVICES.map((d) => (
          <Panel key={d.id} style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <span style={{ width: 44, height: 44, borderRadius: 13, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", color: DEVICE_TINT[d.type], background: "color-mix(in oklch, " + DEVICE_TINT[d.type] + " 14%, var(--surface-card))" }}>
                <Icon name={d.type} size={22} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: "var(--text-md)" }}>{d.name}</div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{d.room}</div>
              </div>
              <Badge tone={d.status === "online" ? "create" : "neutral"} dot>{d.status === "online" ? "онлайн" : "офлайн"}</Badge>
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Активность: {d.lastActivity}</span>
              <Button variant="ghost" size="sm" icon={<Icon name="link-2-off" size={15} />}>Отвязать</Button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function FakeQR() {
  const cells = Array.from({ length: 49 });
  return (
    <div style={{ width: 120, height: 120, padding: 8, background: "#fff", borderRadius: 12, boxShadow: "var(--glass-shadow)", display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, flex: "none" }}>
      {cells.map((_, i) => <div key={i} style={{ background: (i * 7 + ((i * i) % 5)) % 3 === 0 ? "#161B23" : "transparent", borderRadius: 1 }} />)}
    </div>
  );
}

export function GeneralSettingsScreen() {
  return (
    <div style={{ maxWidth: 640 }}>
      <WorkHead title="Общие настройки" sub="Реквизиты и параметры школы" actions={<Button variant="create" icon={<Icon name="check" size={16} />}>Сохранить</Button>} />
      <Panel style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <Input label="Название школы" defaultValue={SCHOOL.name} icon={<Icon name="building-2" size={16} />} />
        <Input label="Адрес" defaultValue={SCHOOL.address} icon={<Icon name="map-pin" size={16} />} />
        <Input label="ИНН" defaultValue={SCHOOL.inn} icon={<Icon name="hash" size={16} />} />
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}><Select label="Часовой пояс" defaultValue={SCHOOL.timezone} options={[SCHOOL.timezone, "Europe/Moscow (UTC+3)", "Asia/Yekaterinburg (UTC+5)"]} /></div>
          <div style={{ flex: 1 }}><Select label="Язык системы" defaultValue={SCHOOL.lang} options={["Русский", "English"]} /></div>
        </div>
        <div className="eds-field">
          <label className="eds-field__label">Логотип</label>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(145deg,#2563EB,#5B8DEF)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--glow-accent)" }}><Icon name="graduation-cap" size={26} /></span>
            <Button variant="secondary" size="sm" icon={<Icon name="image" size={15} />}>Загрузить</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function SecurityScreen() {
  const [qrScan, setQrScan] = useState(true);
  const [twofa, setTwofa] = useState<Record<string, boolean>>({ Директор: true, Завуч: true });
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
      <WorkHead title="Безопасность" sub="Политики входа и защита учётных записей" />
      <Panel style={{ padding: 22 }}>
        <h3 style={{ marginBottom: 14 }}>Сессии и вход</h3>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
          <div style={{ width: 220 }}><Input label="Длина сессии (часы)" type="number" defaultValue={8} /></div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", paddingBottom: 10 }}>Школьное значение имеет приоритет над личным в Флёр-аккаунте.</div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
          <Switch checked={qrScan} onChange={() => setQrScan((v) => !v)} label="Обязательный QR-скан при входе — для всей школы" />
        </div>
      </Panel>
      <Panel style={{ padding: 22 }}>
        <h3 style={{ marginBottom: 4 }}>Двухфакторная аутентификация</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginBottom: 14 }}>Для каких ролей обязательна</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 10 }}>
          {ROLES.slice(0, 5).map((r) => (
            <div key={r} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "var(--glass-bg-sunken)" }}>
              <span style={{ fontSize: "var(--text-sm)" }}>{r}</span>
              <Switch checked={!!twofa[r]} onChange={() => setTwofa((s) => ({ ...s, [r]: !s[r] }))} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <div style={{ padding: "18px 20px 4px" }}><h3>Журнал входов</h3></div>
        <table className="adm-table">
          <thead><tr><th>Пользователь</th><th>Устройство</th><th>Время</th><th>Статус</th></tr></thead>
          <tbody>
            {LOGIN_JOURNAL.map((l, i) => (
              <tr key={i}>
                <td style={{ color: "var(--text-strong)", fontWeight: 500 }}>{l.user}</td>
                <td>{l.device}</td><td>{l.time}</td>
                <td><Badge tone={l.status === "success" ? "create" : "danger"} dot>{l.status === "success" ? "успешно" : "отклонён"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

const PERM_LABEL: Record<PermState, string> = { allow: "разрешено", view: "только просмотр", deny: "запрещено" };
const PERM_TONE: Record<PermState, "create" | "accent" | "danger"> = { allow: "create", view: "accent", deny: "danger" };
const PERM_CYCLE: PermState[] = ["allow", "view", "deny"];

export function PermissionsScreen() {
  const [matrix, setMatrix] = useState<Record<string, PermState[]>>(PERMISSIONS);
  const cycle = (role: string, col: number) =>
    setMatrix((m) => ({ ...m, [role]: m[role].map((v, i) => (i === col ? PERM_CYCLE[(PERM_CYCLE.indexOf(v) + 1) % 3] : v)) }));
  return (
    <div>
      <WorkHead title="Разрешения" sub="Матрица: роль × действие. Нажмите ячейку, чтобы изменить." />
      <Panel style={{ overflowX: "auto" }}>
        <table className="adm-table">
          <thead><tr><th>Роль</th>{PERM_ACTIONS.map((a) => <th key={a} style={{ textAlign: "center" }}>{a}</th>)}</tr></thead>
          <tbody>
            {Object.keys(matrix).map((role) => (
              <tr key={role}>
                <td style={{ color: "var(--text-strong)", fontWeight: 600 }}>{role}</td>
                {matrix[role].map((st, col) => (
                  <td key={col} style={{ textAlign: "center" }}>
                    <button onClick={() => cycle(role, col)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }} title={PERM_LABEL[st]}>
                      <Badge tone={PERM_TONE[st]} dot>{PERM_LABEL[st]}</Badge>
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
