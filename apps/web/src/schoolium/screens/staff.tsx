/**
 * Персонал: `S-30` три секции карточек, `S-31` карточка сотрудника (`M-06`) с
 * QR-активацией и кодом входа, `M-07` добавление роли.
 *
 * Кнопка «Добавить» стоит ТОЛЬКО у множественных ролей — учредители и
 * преподаватели (AR-60): директор и оба зама существуют в одном экземпляре, и
 * «для симметрии» кнопка не добавляется. Отдельной секции «Модераторы» нет:
 * модератор — уровень доступа, а не должность (AR-102).
 */
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ACCESS_PARAMS,
  ROLE_LABELS,
  STAFF_SECTIONS,
  type SchoolRole,
  type StaffCardDto,
} from "@edustore/shared";
import { api, SchoolApiError } from "../api";
import { useAsync, useIsMobile, usePolling } from "../hooks";
import { Avatar, Badge, Button, EmptyState, ErrorState, Modal, PopoverOrSheet, Skeletons, Toast, useToast } from "../ui";
import { useSession } from "../session";
import { navigate } from "../router";

/** Роли, которые можно ДОБАВИТЬ карточке зарегистрированного сотрудника (AR-102). */
const ADDABLE_ROLES: SchoolRole[] = ["founder", "director", "deputy_academic", "deputy_upbringing", "teacher", "moderator"];

export function StaffScreen({ openId }: { openId?: string }) {
  const { can } = useSession();
  const [state, reload] = useAsync(() => api.staff());
  const [expanded, setExpanded] = useState(false);
  /** Свёрнутые секции мобайла (§6). По умолчанию раскрыты все три. */
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const { toast, showToast } = useToast();
  const mobile = useIsMobile();
  const mayManage = can("staff.manage");

  if (state.status === "loading") return <Skeletons count={6} />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={reload} />;

  const cards = state.data;
  const open = openId ? cards.find((c) => c.id === openId) ?? null : null;
  const shown = expanded || cards.length > 0;

  const addCard = async (role: SchoolRole) => {
    try {
      await api.addStaffCard(role);
      reload();
    } catch (e) {
      showToast(e instanceof SchoolApiError ? e.message : "Не получилось");
    }
  };

  return (
    <>
      <div className="sch-page-head">
        <h1>Персонал</h1>
        {mayManage ? (
          <Button kind="primary" testId="S-30.btn.activate" onClick={() => setExpanded(true)}>
            Активация персонала
          </Button>
        ) : null}
      </div>

      {!shown ? (
        <EmptyState
          testId="S-30.empty"
          title="Персонал не активирован"
          hint={mayManage ? "Активируйте сотрудников — они получат доступ" : "Сотрудники появятся, когда модератор их активирует"}
          action={
            mayManage ? (
              <Button kind="primary" testId="S-30.btn.activate" onClick={() => setExpanded(true)}>
                Активация персонала
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="sch-sections">
          {STAFF_SECTIONS.map((sec) => (
            /* На мобайле секции сворачиваемые (§6): три раскрытых списка на
               390px превращают экран в бесконечную ленту, в которой третья
               секция — «Преподаватели», самая нужная, — всегда внизу.
               На десктопе три колонки видны разом, и сворачивать нечего. */
            <section
              key={sec.level}
              data-testid={`S-30.section.level${sec.level}`}
              className={mobile ? "sch-section--collapsible" : undefined}
            >
              <div className="sch-row sch-row--between">
                {mobile ? (
                  <button
                    className="sch-section-toggle"
                    aria-expanded={!collapsed.has(sec.level)}
                    onClick={() =>
                      setCollapsed((cur) => {
                        const next = new Set(cur);
                        if (next.has(sec.level)) next.delete(sec.level);
                        else next.add(sec.level);
                        return next;
                      })
                    }
                  >
                    <span aria-hidden="true">{collapsed.has(sec.level) ? "▸" : "▾"}</span> {sec.title}
                  </button>
                ) : (
                  <h2 className="sch-section-title">{sec.title}</h2>
                )}
                {/* Только у множественных ролей (AR-60). */}
                {mayManage && sec.addable ? (
                  <Button
                    kind="secondary"
                    testId={sec.addable === "founder" ? "S-30.btn.addFounder" : "S-30.btn.addTeacher"}
                    onClick={() => addCard(sec.addable as SchoolRole)}
                  >
                    Добавить
                  </Button>
                ) : null}
              </div>
              {mobile && collapsed.has(sec.level) ? null : (
                <div className="sch-cards--3">
                  {cards
                    .filter((c) => c.section === sec.level)
                    .map((c) => (
                      <PersonCard key={c.id} card={c} />
                    ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {open ? <StaffCardModal card={open} onClose={() => navigate("/staff")} onChanged={reload} /> : null}
      {toast ? <Toast text={toast} /> : null}
    </>
  );
}

function PersonCard({ card }: { card: StaffCardDto }) {
  return (
    <button
      className={card.registered ? "sch-card sch-card--clickable" : "sch-card sch-card--clickable sch-card--locked"}
      data-testid="S-30.card.person"
      data-card-id={card.id}
      onClick={() => navigate(`/staff/${card.id}`)}
    >
      <div className="sch-row">
        {card.registered ? <Avatar name={card.name} url={card.avatarUrl} /> : <span aria-hidden="true">🔒</span>}
        <span>
          <span className="sch-card-title">{card.name ?? "Не активирован"}</span>
          <br />
          <span className="sch-card-sub">{card.roles.map((r) => ROLE_LABELS[r]).join(", ")}</span>
        </span>
      </div>
      {card.deactivated ? (
        <div style={{ marginTop: "var(--sp-12)" }}>
          <Badge muted>доступ закрыт</Badge>
        </div>
      ) : null}
    </button>
  );
}

// ─────────────────────────── S-31 · карточка сотрудника (M-06) ───────────────────────────

function StaffCardModal({ card, onClose, onChanged }: { card: StaffCardDto; onClose: () => void; onChanged: () => void }) {
  const { can } = useSession();
  const [cur, setCur] = useState(card);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"waiting" | "scanned" | "used" | "expired">("waiting");
  const [registeredName, setRegisteredName] = useState<string | null>(card.name);
  const [loginCode, setLoginCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [addRole, setAddRole] = useState<DOMRect | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "deactivate">(null);
  const { toast, showToast } = useToast();
  const mayManage = can("staff.manage");
  const qrSize = useIsMobile() ? 200 : 240;

  // QR активации выпускается при открытии карточки; закрытие карточки его гасит.
  useEffect(() => {
    if (cur.registered || !mayManage) return;
    api
      .activationToken(cur.id)
      .then((t) => setToken(t.token))
      .catch(() => undefined);
  }, [cur.id, cur.registered, mayManage]);

  usePolling(
    async () => {
      const r = await api.activationStatus(cur.id).catch(() => null);
      if (!r) return;
      setStatus(r.status as typeof status);
      if (r.registeredName) {
        setRegisteredName(r.registeredName);
        const fresh = await api.staffCard(cur.id).catch(() => null);
        if (fresh) setCur(fresh);
        onChanged();
      }
    },
    ACCESS_PARAMS.pollIntervalMs,
    !cur.registered && mayManage && status === "waiting",
  );

  const close = () => {
    // `S-31.btn.close` гасит QR: код не переживает встречу (AR-76).
    if (!cur.registered && mayManage) void api.closeCard(cur.id).catch(() => undefined);
    onClose();
  };

  const act = async (fn: () => Promise<StaffCardDto | { ok: boolean }>) => {
    try {
      const r = await fn();
      if (r && typeof r === "object" && "id" in r) setCur(r as StaffCardDto);
      onChanged();
    } catch (e) {
      showToast(e instanceof SchoolApiError ? e.message : "Не получилось");
    }
  };

  return (
    <>
      <Modal
        title={cur.name ?? "Карточка сотрудника"}
        width={480}
        onClose={close}
        testId="M-06"
        mobile="fullscreen"
        footer={
          <div className="sch-actions">
            <Button kind="ghost" testId="S-31.btn.close" onClick={close}>
              Закрыть
            </Button>
          </div>
        }
      >
        {!cur.registered ? (
          <div className="sch-qr">
            <div className="sch-qr-frame" data-testid="S-31.qr">
              {token ? (
                /* На мобайле QR 200px (§6): 240 не оставляют места подписи и
                   сроку жизни кода, а без них человек не знает, что код гаснет. */
                <QRCodeSVG value={`${window.location.origin}/join/${token}`} size={qrSize} />
              ) : (
                <div className="sch-skeleton sch-skeleton--qr" />
              )}
            </div>
            <p data-testid="S-31.status">
              {registeredName ? `Зарегистрирован: ${registeredName}` : "Ожидание регистрации"}
            </p>
            <p className="sch-muted">
              Код живёт {ACCESS_PARAMS.activationTtlMinutes} минут либо до закрытия карточки
            </p>
          </div>
        ) : (
          <div className="sch-stack">
            <div className="sch-row">
              <Avatar name={cur.name} url={cur.avatarUrl} />
              <span>
                {cur.name}
                {cur.deactivated ? (
                  <span data-testid="S-31.badge.inactive" style={{ marginLeft: "var(--sp-8)" }}>
                    <Badge muted>доступ закрыт</Badge>
                  </span>
                ) : null}
              </span>
            </div>
            <p data-testid="S-31.status">Зарегистрирован: {cur.name}</p>

            <div className="sch-chips">
              {cur.roles.map((r) => (
                <span key={r} className="sch-row" style={{ gap: "var(--sp-4)" }}>
                  <Badge>{ROLE_LABELS[r]}</Badge>
                  {mayManage ? (
                    <Button kind="ghost" testId="S-31.btn.removeRole" onClick={() => act(() => api.removeRole(cur.id, r))}>
                      Снять
                    </Button>
                  ) : null}
                </span>
              ))}
            </div>

            {mayManage ? (
              <>
                <div className="sch-actions sch-actions--start">
                  <Button
                    kind="secondary"
                    testId="S-31.btn.addRole"
                    onClick={(e) => setAddRole(e.currentTarget.getBoundingClientRect())}
                  >
                    Добавить роль
                  </Button>
                  <Button
                    kind="primary"
                    testId="S-31.btn.loginCode"
                    onClick={async () => {
                      try {
                        setLoginCode(await api.loginCode(cur.id));
                      } catch (e) {
                        showToast(e instanceof SchoolApiError ? e.message : "Не получилось");
                      }
                    }}
                  >
                    Код для входа
                  </Button>
                </div>

                {loginCode ? (
                  <div className="sch-canvas sch-qr" data-testid="S-31.loginCode">
                    <QRCodeSVG value={`${window.location.origin}/login/code/${loginCode.code}`} size={160} />
                    <strong style={{ fontSize: "var(--fs-h2)", letterSpacing: "0.2em" }}>{loginCode.code}</strong>
                    <p className="sch-muted">
                      Код живёт {ACCESS_PARAMS.loginCodeTtlMinutes} минут, одноразовый
                    </p>
                  </div>
                ) : null}

                <div className="sch-actions sch-actions--start">
                  {/* Подмену решает СЕРВЕР: ровно одна кнопка из двух (AR-89). */}
                  {cur.deactivated ? (
                    <Button kind="secondary" testId="S-31.btn.reactivateStaff" onClick={() => act(() => api.reactivateStaff(cur.id))}>
                      Вернуть доступ
                    </Button>
                  ) : cur.hasHistory ? (
                    <Button kind="danger" testId="S-31.btn.deactivateStaff" onClick={() => setConfirm("deactivate")}>
                      Деактивировать
                    </Button>
                  ) : (
                    <Button kind="danger" testId="S-31.btn.deleteStaff" onClick={() => setConfirm("delete")}>
                      Удалить сотрудника
                    </Button>
                  )}
                  <Button
                    kind="danger"
                    testId="S-31.btn.revokeSessions"
                    onClick={() => act(() => api.revokeSessions(cur.id))}
                  >
                    Закрыть активные сессии
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </Modal>

      {/*
        M-07 — добавление роли: поповер 320px У КНОПКИ на десктопе, нижний лист
        на мобайле (§3). До этапа 3 здесь стояла центрированная модалка, хотя
        комментарий рядом называл поповер: реестр говорил одно, экран делал
        другое, и заметить это было нечем — идентификаторы модалок ворота не
        проверяют, а смок до `M-07` не доходит.
      */}
      {addRole ? (
        <PopoverOrSheet
          label="Добавить роль"
          width={320}
          anchor={addRole}
          onClose={() => setAddRole(null)}
          testId="M-07"
          level={2}
        >
          <div className="sch-stack">
            {ADDABLE_ROLES.filter((r) => !cur.roles.includes(r)).map((r) => (
              <Button
                key={r}
                kind="secondary"
                onClick={async () => {
                  await act(() => api.addRole(cur.id, r));
                  setAddRole(null);
                }}
              >
                {ROLE_LABELS[r]}
              </Button>
            ))}
          </div>
        </PopoverOrSheet>
      ) : null}

      {/* M-13 — подтверждение разрушающего действия над сотрудником. */}
      {confirm ? (
        <Modal
          title="Подтверждение"
          width={400}
          onClose={() => setConfirm(null)}
          testId="M-13"
        mobile="sheet"
          level={2}
          footer={
            <div className="sch-actions">
              <Button kind="ghost" onClick={() => setConfirm(null)}>
                Отмена
              </Button>
              <Button
                kind={confirm === "delete" ? "danger" : "primary"}
                onClick={async () => {
                  if (confirm === "delete") {
                    try {
                      await api.deleteStaff(cur.id);
                      onChanged();
                      onClose();
                    } catch (e) {
                      showToast(e instanceof SchoolApiError ? e.message : "Не получилось");
                      setConfirm(null);
                    }
                  } else {
                    await act(() => api.deactivateStaff(cur.id));
                    setConfirm(null);
                  }
                }}
              >
                {confirm === "delete" ? "Удалить" : "Деактивировать"}
              </Button>
            </div>
          }
        >
          <p>
            {confirm === "delete"
              ? `Удалить ${cur.name}? Обратной операции нет.`
              : `Деактивировать ${cur.name}? Привязки к предметам снимутся, отметки останутся.`}
          </p>
        </Modal>
      ) : null}

      {toast ? <Toast text={toast} /> : null}
    </>
  );
}
