# EduStore v2 — экстракция ценных активов из v1

Это НЕ работающее приложение. Это курируемый набор кусков v1, переживших аудит
(`docs/REWRITE_AUDIT.md`), — исходный материал для сборки новой версии.
Старый код остаётся нетронутым в корне репо и в истории git как «карьер».

## Порядок работы (зафиксирован)

1. ✅ Аудит v1 → `docs/REWRITE_AUDIT.md`.
2. ✅ Экстракция ценного в `v2/` (этот набор).
3. ⬜ Аудит архитектуры v2: границы модулей, контракты, целевая структура.
4. ⬜ Заморозка спеки: спецификация + FSM + таблицы прав (владелец).
5. ⬜ Детальное описание требуемого UI (проход по кабинетам).
6. ⬜ Сборка v2: kernel → identity → одна модель домена → движок → фронт.

## Карта набора и статусы

Статусы: **AS-IS** — переносится с минимальной адаптацией; **CONCEPT** — идея
верна, реализацию переписать (что именно менять — в REWRITE_AUDIT.md);
**REFERENCE** — образец/справочник, в v2-код не копируется дословно.

### docs/ — проектный канон (актив №1)
| Файл | Роль |
|---|---|
| `PARAMETERS.md` | Событийная архитектура: паттерны, анти-петли, 13 параметров, приоритеты. Канон. |
| `ENGINE.md` | Решения и стабы движка. Канон. |
| `TENANCY.md` | Модель изоляции (школа=Workspace) + путь к RLS. Канон. |
| `ARCHITECTURE.md`, `adr/` | Модульный монолит, реестр секций, Флёрус OIDC. |
| `REWRITE_AUDIT.md` | Полные вердикты аудита по каждому куску. |

### kernel/ — инфраструктурное ядро backend
| Кусок | Статус | Заметка |
|---|---|---|
| `events/` | **AS-IS** | Конверт DomainEvent, EventBus, depth-guard. |
| `outbox/` | **AS-IS** | Transactional outbox + идемпотентный inbox + worker. |
| `storage/` | **AS-IS** | S3-абстракция, presigned, ленивый клиент. |
| `tenant/tenant-context.ts` | **AS-IS** | ALS-обёртка. |
| `tenant/` guard+interceptor+models | **CONCEPT** | Мигрировать с Prisma `$use` на `$extends` или RLS. |
| `prisma/` | **AS-IS** | С поправкой на способ навешивания изоляции. |
| `authz/` | **CONCEPT** | Механика почти дословно; каталог прав пересмотреть; добавить кэш. |
| `entitlements/` | **CONCEPT** | То же + кэш. |
| `auth/` (без dev-guard/teacher-decorator — они выброшены) | **CONCEPT** | BFF-OIDC по ADR-0005; одна identity (SessionUser); распилить provision(). |
| `audit/` | **CONCEPT** | Паттерн as-is; развязать реестр AUDITED от доменных импортов. |
| `app.module.ts`, `main.ts` | **REFERENCE** | Ценен порядок guard/interceptor. |

### domains/ — доменная логика
| Кусок | Статус | Заметка |
|---|---|---|
| `engine/` | **AS-IS (концептуально)** | Solver, два ритма, Lesson FSM, ИОМ, летучка, журнал grade.posted. Сердце платформы. Закрыть помеченные стабы. |
| `comm/` | **AS-IS (инварианты дословно)** | Безопасность миноров по рёбрам Parenthood, явный mode, FSM объявлений. |
| `consent/` | **AS-IS** | 152-ФЗ, append-only. |
| `standards/` | **CONCEPT** | Разделение нормы↔применение; Json-поля домоделировать. |
| `doc/` | **CONCEPT (ближе к as-is)** | FSM статусов, иммутабельность official; урезать спекулятивные заделы. |
| `textbook/` | **CONCEPT** | Событийная цепочка enriched→parsed. |
| `voice/` | **CONCEPT** | ACL-фасад ASR + constrained vocab + деградация; AsrClient → в kernel. |
| `oidc-device/` | **CONCEPT** | RFC 8628; in-memory состояние → в стор. |
| `structure/`, `cabinets/` | **CONCEPT** | Онбординг/надзор, тонкий CRUD. |
| `parameters/` | **REFERENCE** | Каркас каскада (continuation+inbox+depth) — образец; 13 параметров реализовывать заново по PARAMETERS.md §5. |

НЕ перенесено (выброшено по аудиту): journal, planning, teacher, materials,
reports, notes (Phase-0 дубли/заглушки), pilot (временный), dev-auth.guard,
teacher.decorator, демо-модели MealOrder/ChannelMembership.

### checks/ — смоук-скрипты инвариантов
**REFERENCE** → перерастить в настоящие тесты. Покрывают: каскады, инварианты
миноров, doc→textbook, tenant-изоляцию, storage, pilot/RBAC.
Первым в v2 написать отсутствующий `engine-check` (пайплайн КТП→Solver→КПП→урок).

### web/ — переносимый скелет фронта
| Кусок | Статус | Заметка |
|---|---|---|
| `lib/http.ts` | **AS-IS** | Единственный HTTP-слой v2. |
| `lib/audio.ts`, `lib/materialsApi.ts` | **AS-IS** | VoiceRecorder; XHR-upload с прогрессом (putFile). |
| `app/prefs.tsx` + `design/styles.css` (токены) | **AS-IS** | Персонализация data-атрибутами. |
| `design/ds/` (бывш. admin/ds) | **AS-IS (база единой ДС)** | Выбрана базой; иконки lucide. |
| `sections/types.ts` + `registry.ts` + `app/AppShell.tsx` | **CONCEPT** | Лучший фронт-концепт; обобщить зоны, слить три реестра v1 в один. |
| `home/useDeviceFlow.ts` + `deviceApi.ts` | **AS-IS** | Device flow / QR-киоск. |
| `pwa/` (sw.js, manifest) | **CONCEPT** | Стратегия network-first/SWR верная. |
| `shared/contracts.ts` | **CONCEPT** | Паттерн общего контракта; в v2 генерировать из схемы (Prisma→zod), не писать руками. |

НЕ перенесено: вторая ДС (design/Icon.tsx SVG), api.ts/pilotApi.ts/structureApi.ts,
mobile/-слой, MVoice/VoiceOverlay-дубль, самодельный роутинг, pilot-экраны.

### services/asr/ — **AS-IS целиком**
Автономный FastAPI + faster-whisper (mock-режим, деградация, constrained vocab).

### data/ — модель данных
`schema.prisma` (71 модель) — **носитель доменных знаний**, перенесена целиком
как справочник. При сборке v2 брать кластерами по вердиктам REWRITE_AUDIT §3-5:
tenant-фундамент/events/academic core/consent — as-is; движок/ИОМ/doc/comm —
concept (домоделировать Json-поля); MealOrder/ChannelMembership/PilotInvite — нет.
`seed.ts` — **REFERENCE** (образец идемпотентного сида).

### infra/ — референс деплоя
Dockerfile'ы, dev/prod compose, Caddy/nginx, ci.yml — **CONCEPT**: single-VPS
схема грамотная; CI пересобрать (добавить lint/test/typecheck/миграции).

## Правила v2 (чтобы не повторить v1)
1. Одно понятие — одна реализация (журнал = JournalCell/grade.posted, урок = Lesson FSM).
2. Границы модулей — линтом (eslint-boundaries), не дисциплиной.
3. Инварианты — тестами с первого дня (tenant fail-closed, inbox-идемпотентность, depth-guard, движок).
4. Shared-контракт генерируется из схемы, не пишется руками.
5. Спека/FSM/права замораживаются ДО кода; UI описывается ДО вёрстки.
