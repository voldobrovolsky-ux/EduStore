import { Icon } from "../ds/Icon";
import { Badge, Button } from "../ds/components";
import { WorkHead, Panel } from "./_shared";
import { LICENSE, PAYMENTS, SEATS } from "../data";

export function SubscriptionScreen() {
  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
      <WorkHead title="Подписка" sub="Текущий тариф и активные модули" actions={<Button variant="secondary" icon={<Icon name="credit-card" size={16} />}>Управление подпиской</Button>} />
      <Panel style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><h2 style={{ fontSize: "var(--text-2xl)" }}>{LICENSE.tariff}</h2><Badge tone="create" dot>активна</Badge></div>
          <div style={{ color: "var(--text-muted)", marginTop: 6, fontSize: "var(--text-sm)" }}>{LICENSE.price} · продление {LICENSE.renewal}</div>
        </div>
        <span style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(145deg,#16A34A,#54C57E)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(22,163,74,.4)" }}><Icon name="package" size={28} /></span>
      </Panel>
      <Panel style={{ padding: 22 }}>
        <h3 style={{ marginBottom: 14 }}>Модули</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
          {LICENSE.modules.map((m) => (
            <div key={m.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "11px 13px", borderRadius: 10, background: "var(--glass-bg-sunken)" }}>
              <span style={{ fontSize: "var(--text-sm)", color: m.active ? "var(--text-strong)" : "var(--text-faint)" }}>{m.name}</span>
              {m.active ? <Icon name="circle-check" size={18} color="var(--create)" /> : <Badge tone="neutral">подключить</Badge>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function PaymentScreen() {
  return (
    <div style={{ maxWidth: 760 }}>
      <WorkHead title="Оплата" sub="История платежей" actions={<Button variant="secondary" icon={<Icon name="wallet" size={16} />}>Управление подпиской</Button>} />
      <Panel>
        <table className="adm-table">
          <thead><tr><th>Дата</th><th>Сумма</th><th>Способ</th><th>Статус</th></tr></thead>
          <tbody>
            {PAYMENTS.map((p, i) => (
              <tr key={i}>
                <td style={{ color: "var(--text-strong)", fontWeight: 500 }}>{p.date}</td>
                <td>{p.amount}</td><td style={{ color: "var(--text-muted)" }}>{p.method}</td>
                <td><Badge tone="create" dot>оплачено</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export function SeatsScreen() {
  return (
    <div style={{ maxWidth: 680 }}>
      <WorkHead title="Места" sub="Занятые и доступные места по ролям" />
      <Panel style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        {SEATS.map((s) => {
          const pct = Math.round((s.used / s.total) * 100);
          return (
            <div key={s.role}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ fontWeight: 500, color: "var(--text-strong)", fontSize: "var(--text-sm)" }}>{s.role}</span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{s.used} / {s.total}</span>
              </div>
              <div className="adm-meter"><div className="adm-meter__fill" style={{ width: pct + "%", background: pct > 85 ? "var(--warning)" : "var(--accent)" }} /></div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
