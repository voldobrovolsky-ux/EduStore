import { Icon } from "../ds/Icon";
import { Badge, Button } from "../ds/components";
import { WorkHead, Panel } from "./_shared";
import { BACKUPS, RESTORE_HISTORY } from "../data";

export function BackupsScreen() {
  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
      <WorkHead title="Резервные копии" sub="Расписание и состояние бэкапов" actions={<Button variant="secondary" icon={<Icon name="download" size={16} />}>Создать копию сейчас</Button>} />
      <div className="adm-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Panel style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: "var(--text-muted)" }}><Icon name="calendar-clock" size={18} /><span style={{ fontSize: "var(--text-sm)" }}>Расписание</span></div>
          <div style={{ fontWeight: 600, color: "var(--text-strong)" }}>{BACKUPS.schedule}</div>
        </Panel>
        <Panel style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: "var(--text-muted)" }}><Icon name="circle-check" size={18} color="var(--create)" /><span style={{ fontSize: "var(--text-sm)" }}>Последний успешный</span></div>
          <div style={{ fontWeight: 600, color: "var(--text-strong)" }}>{BACKUPS.lastSuccess}</div>
        </Panel>
      </div>
      <Panel>
        <div style={{ padding: "18px 20px 4px" }}><h3>История</h3></div>
        <table className="adm-table">
          <thead><tr><th>Дата</th><th>Размер</th><th>Статус</th></tr></thead>
          <tbody>
            {BACKUPS.history.map((h, i) => (
              <tr key={i}>
                <td style={{ color: "var(--text-strong)", fontWeight: 500 }}>{h.date}</td>
                <td style={{ color: "var(--text-muted)" }}>{h.size}</td>
                <td><Badge tone={h.status === "ok" ? "create" : "danger"} dot>{h.status === "ok" ? "успешно" : "ошибка"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export function RestoreScreen() {
  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 16 }}>
      <WorkHead title="Восстановление" sub="Откат к резервной копии" />
      <Panel style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 48, height: 48, borderRadius: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--warning)", background: "var(--warning-tint)" }}><Icon name="rotate-ccw" size={24} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "var(--text-strong)" }}>Восстановить из копии</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Последняя: {BACKUPS.lastSuccess}. Действие затронет все данные школы.</div>
          </div>
          <Button variant="danger" icon={<Icon name="rotate-ccw" size={16} />}>Восстановить</Button>
        </div>
      </Panel>
      <Panel>
        <div style={{ padding: "18px 20px 4px" }}><h3>История восстановлений</h3></div>
        <table className="adm-table">
          <thead><tr><th>Дата</th><th>Кто</th><th>Статус</th></tr></thead>
          <tbody>
            {RESTORE_HISTORY.map((r, i) => (
              <tr key={i}>
                <td style={{ color: "var(--text-strong)", fontWeight: 500 }}>{r.date}</td>
                <td style={{ color: "var(--text-muted)" }}>{r.by}</td>
                <td><Badge tone="create" dot>успешно</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
