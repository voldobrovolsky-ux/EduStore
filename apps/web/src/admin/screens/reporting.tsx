import { Icon } from "../ds/Icon";
import { Badge, Button, Switch } from "../ds/components";
import { WorkHead, Panel } from "./_shared";
import { AUTO_REPORTS, REPORT_LOG } from "../data";

export function AutoReportsScreen() {
  return (
    <div style={{ maxWidth: 820 }}>
      <WorkHead title="Автоотчёты" sub="Кому, как часто и в каком формате отправлять" actions={<Button variant="create" icon={<Icon name="plus" size={16} />}>Новый автоотчёт</Button>} />
      <Panel>
        <table className="adm-table">
          <thead><tr><th>Отчёт</th><th>Кому</th><th>Частота</th><th>Формат</th><th>Включён</th></tr></thead>
          <tbody>
            {AUTO_REPORTS.map((r, i) => (
              <tr key={i}>
                <td style={{ color: "var(--text-strong)", fontWeight: 500 }}>{r.name}</td>
                <td style={{ color: "var(--text-muted)" }}>{r.to}</td>
                <td>{r.frequency}</td>
                <td><Badge tone="neutral">{r.format}</Badge></td>
                <td><Switch checked={r.enabled} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export function ReportJournalScreen() {
  return (
    <div style={{ maxWidth: 820 }}>
      <WorkHead title="Журнал отчётов" sub="История отправленных отчётов" />
      <Panel>
        <table className="adm-table">
          <thead><tr><th>Отчёт</th><th>Дата</th><th>Получатель</th><th>Статус</th></tr></thead>
          <tbody>
            {REPORT_LOG.map((r, i) => (
              <tr key={i}>
                <td style={{ color: "var(--text-strong)", fontWeight: 500 }}>{r.name}</td>
                <td>{r.date}</td><td style={{ color: "var(--text-muted)" }}>{r.recipient}</td>
                <td><Badge tone={r.status === "sent" ? "create" : "danger"} dot>{r.status === "sent" ? "отправлен" : "ошибка"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
