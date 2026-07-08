# Аудит перед перезапуском: что вытащить из EduStore v1

> Дата: 2026-07-08. Цель — не спасти текущий код, а составить карту переносимых
> активов для новой версии: готовые «ячейки», архитектурные концепты и то, что
> надо выбросить. Код v1 признаётся невыживаемым как целое — но он содержит
> непропорционально много ценного в отдельных местах.

---

## 1. Диагноз: почему «моноблок»

История репозитория — 49 коммитов за ~2,5 недели (15.06–02.07), в которых видно
**минимум шесть перезакладок фундамента**, каждая ложилась поверх предыдущей без
ревизии старого слоя:

1. Кабинет учителя (Phase-0: `teacher/planning/journal/voice` + `AppShell`).
2. Мобильный PWA-слой (параллельная копия данных и UI).
3. Система параметров (событийный фундамент outbox/inbox).
4. Админ-кабинет (вторая дизайн-система `admin/ds`).
5. Флёрус OIDC + tenancy/authz/compliance/entitlements (kernel-слой).
6. Движок Phase-1 (`engine`: КТП→Solver→КПП, ИОМ, летучка, второй журнал).
7. Документохранилище + парсер учебников, Communitoria, пилотный QR-auth.

Итог — **два поколения кода сосуществуют** и дублируют друг друга:

| Понятие | Phase-0 (демо) | Phase-1 (движок) |
|---|---|---|
| Журнал | `modules/journal` на таблице `Grade` | `engine/journal.service` на `JournalCell` через `grade.posted` |
| Урок | `planning` («станции метро») | `engine` (КТП/КПП/Lesson FSM) |
| Материалы | `modules/materials` (stub-URL) | `textbook/material.service` через doc-контур |
| HTTP-клиент (web) | `lib/api.ts` (хардкод dev-user) | `lib/http.ts` (эталон) + ещё 2 самодельных |
| Дизайн-система | `design/` (рукописные SVG) | `admin/ds/` (lucide, glass) + 5 CSS-островов |
| Identity | `teacherId`/`@CurrentTeacher` (мёртвый слой) | `SessionUser`/`@CurrentUser` |

Сквозные проблемы: **ноль тестов** (`*.spec.ts` нет вообще; есть только 7
смоук-скриптов), утечка слоёв (ядро `common/audit` импортирует доменные
контракты), tenant-изоляция на deprecated Prisma `$use`, CI проверяет только
«компилируется», `packages/shared` покрывает ~1/3 реальных контрактов.

**Вывод подтверждается: чинить это целиком дороже, чем пересобрать из рабочих
кусков.** Но кусков — много, и они качественные.

---

## 2. Самые ценные активы (неочевидный итог)

Ценность распределена не так, как обычно ожидают:

1. **Документация — актив №1.** `docs/PARAMETERS.md` (исследование event-паттернов
   по реальным системам: Ellucian, PowerSchool, openIMIS, FIWARE + 5 рычагов против
   каскад-хаоса), `docs/ENGINE.md`, `docs/TENANCY.md`, ADR 0001/0003/0005,
   `docs/AUDIT.md` (рынок/фичи). Это готовый проектный канон новой версии.
2. **Prisma-схема (71 модель) — носитель доменных знаний.** Tenant-изоляция
   денормализована на каждой таблице, композитные инварианты, комментарии со
   ссылками на параграфы ТЗ. Даже там, где код выбрасывается, схема фиксирует
   предметную модель.
3. **Событийный kernel** (events + outbox/inbox + depth-guard) — эталонный,
   переносится дословно.
4. **Движок** (`engine/`) — единственный модуль с настоящей доменной логикой:
   Solver, FSM, инварианты «предлагает→решает».
5. **ASR-сервис** — полностью автономный, переносится копированием папки.

---

## 3. ВЗЯТЬ КАК ЕСТЬ — готовые «ячейки» (переносить с минимальной адаптацией)

### Backend kernel
- **`common/events/`** — конверт `DomainEvent` (correlationId/causationId/depth),
  абстрактный `EventBus` с NATS-подобным `subjectMatches`, `InProcessEventBus`
  с depth-guard (MAX=12) и изоляцией падений. Замена транспорта на NATS = одна
  строка `useClass`.
- **`common/outbox/`** — transactional outbox (enqueue в транзакции домена),
  диспетчер PENDING→PUBLISHED→FAILED(DLQ) c retry, фоновый worker без наслоения
  тиков, идемпотентный inbox (`processedEvent`, effectively-once). Корректная
  durability-семантика, домен-независимо. + модели `OutboxEvent`/`ProcessedEvent`.
- **`common/storage/`** — S3-абстракция `StorageProvider` (presigned URLs, один
  провайдер для Yandex/AWS/MinIO, ленивый клиент, DI через Symbol-токены).
  Образцовый модуль, ноль внешних связей кроме `@aws-sdk/client-s3`.
- **`common/tenant/tenant-context.ts`** — ALS-обёртка (run/runAsSystem/require).
- **`common/prisma/`**, декораторы `@Public`/`@CurrentUser`.

### Доменная логика
- **`modules/engine/`** — целиком как референс-архитектура:
  - детерминированный Solver (КТП→слоты Timetable, честные доменные ошибки
    `INSUFFICIENT_SLOTS`/`KPP_IN_USE`, защита от деструктивной регенерации);
  - разделение двух ритмов Timetable (геометрия) ↔ Kpp (план) через `KppMapping`;
  - Lesson FSM с гейтом `kpp.approved`;
  - ИОМ-аккумулятор (mastery по arCode, формула 0.6/0.25/0.15, confidence=n/3,
    cold-start=unknown, идемпотентность через signalRefs);
  - петля летучки с приватностным гейтом id↔code (печать по кодам, 0 ИИ);
  - журнал только через явный `grade.posted` («предлагает→решает» enforced);
  - `engine.contract.ts` — образец типизированного контракта событий `*V1`.
- **`modules/comm/`** — инварианты безопасности несовершеннолетних: право на DM
  по **ребру `Parenthood`, не по роли**; минор↔минор запрещён; external в канал
  с минором запрещён; `mode` сообщения всегда явный (модель не угадывает);
  нет TTL/исчезающих сообщений (аудируемость); FSM подтверждений объявлений
  sent→delivered→read→acknowledged→overdue с reconcile. Регуляторно критично,
  сделано правильно — сохранить дословно.
- **`modules/consent/`** — 152-ФЗ согласия: append-only grant/revoke, evidenceRef
  для миноров, `has(subject, purpose)` как гейт, deletion.requested.
- **`common/audit/`-модель** — event-driven append-only ПДн-леджер через inbox
  (реализацию развязать от доменных импортов, см. §5).

### Данные
- Кластеры Prisma-схемы: **tenant-фундамент** (Organization/Worknet/Workspace/
  Membership/User), **event infrastructure**, **academic core** (Subject/Class/
  Student/Lesson/Grade/TeachingAssignment), **Consent/AuditLog**,
  **Methodic/Course**.

### Сервисы и инфра
- **`services/asr/`** — FastAPI + faster-whisper: mock-режим для dev/CI, мягкая
  деградация при сбое модели, ленивый singleton с lock, constrained-vocabulary
  biasing (ростер класса → initial_prompt), confidence из avg_logprob. Автономен,
  контракт — один `POST /transcribe`. Копировать папку целиком.
- **Dockerfile'ы api/web** (multi-stage, кеш слоёв, prisma migrate deploy в CMD)
  и **dev docker-compose** (одна команда: postgres+asr(mock)+api+web).

### Frontend
- **`lib/http.ts`** — эталонный HTTP-слой (HttpError с code, credentials,
  DEV-идентичность через setDevIdentity, 204). Сделать единственным.
- **`app/prefs.tsx` + токены `design/styles.css`** — персонализация через
  data-атрибуты на `<html>` (theme/density/anim, prefers-reduced-motion).
- **`packages/shared`** — паттерн общего пакета типов + `API_ROUTES` + хелперы.
- Точечные утилиты: `materialsApi.putFile` (XHR-upload с прогрессом на presigned
  S3), `lib/audio.ts` (VoiceRecorder), `home/useDeviceFlow.ts` (поллинг device flow).

---

## 4. ВЗЯТЬ КОНЦЕПТ — идеи верные, реализацию переписать

| Концепт | Где | Что сохранить / что поменять |
|---|---|---|
| **Tenant-изоляция «школа=Workspace»** | `common/tenant/`, TENANCY.md | Сохранить: ALS + автофильтрация + fail-closed + денормализованный workspaceId + единый реестр моделей. Поменять: Prisma `$use` deprecated → client extensions `$extends` или Postgres RLS (карта моделей уже готова). |
| **RBAC «права-как-данные»** | `common/authz/` | Механика (каталог + boot-sync + `@RequirePermission` + guard) переносится почти дословно; наполнение каталога пересмотреть; добавить кэш (сейчас запрос в БД на каждый роут). |
| **Entitlements/SKU-гейтинг** | `common/entitlements/` | Та же форма, что authz (interceptor после TenantInterceptor — порядок критичен). Добавить кэш. |
| **BFF OIDC (Флёрус)** | `common/auth/`, ADR-0005 | Сохранить: confidential RP, httpOnly-сессия, PKCE, device flow RFC 8628, backchannel logout, fail-closed dev-bypass. Поменять: распилить `provision()`, убрать двойную identity (teacherId/SessionUser), развязать от claim-структуры. |
| **Контракты завуча/методиста** | `modules/standards/` | Разделение «нормы (standards) ↔ применение (engine)» верное; сами модели — сырой Json (`sparki`, `thresholds`, `itemMatrix`) — домоделировать структурно. |
| **Документохранилище** | `modules/doc/` | Единственный писатель файлов, presigned→commit c HEAD-валидацией, FSM draft→review→official→archived, иммутабельность official. Урезать спекулятивные заделы (crdtState, embedding). |
| **Парсер учебников** | `modules/textbook/` | Событийная цепочка `doc.file.enriched → textbook.parsed` (детерминированный fallback + слот под ИИ), развязка от File по fileId без FK. |
| **Голос** | `modules/voice/` | Анти-коррупционный фасад к ASR + constrained vocab + дизамбигуация однофамильцев + graceful degradation (ASR упал → ручной ввод). `AsrClient` поднять в kernel. |
| **Каскады параметров** | `parameters/*`, PARAMETERS.md | Каркас (contingent→comms/nutrition/umk через `continuation()`+inbox+depth-guard) — как есть; сами 13 параметров реализовывать заново по приоритету §5 документа. |
| **Device flow / киоск** | `modules/oidc-device/` | Корректный RFC 8628 (login + kiosk-привязка); in-memory состояние → вынести в стор. |
| **Реестр секций (web)** | `sections/registry.ts`, ADR-0003 | Лучший фронт-концепт: `SectionDescriptor` + одна строка регистрации, AppShell ничего не знает о разделах. Обобщить зоны в данные (сейчас 4 захардкожены) и свести с ним ДВА других реестра (roleRegistry, admin/registry) в одну модель. |
| **Роль → кабинет** | `main.tsx`, `resolveCabinet` | Источник истины — `/me.cabinet` с бэка (верно). Реализацию роутинга заменить на нормальный роутер. |
| **PWA** | `public/sw.js` | Network-first для /api, SWR для статики — стратегия верная. |
| **ИОМ-граф** | CompetencyNode/MasteryEdge | Идея графа компетенций как read-model сильная; формулы из Json → в структуру. |
| **Prod-деплой single-VPS** | docker-compose.prod.yml, Caddy/nginx | Порты только на 127.0.0.1, TLS через reverse-proxy, два варианта фронт-двери — грамотный референс. |
| **Смоук-скрипты** | `apps/api/scripts/*-check.ts` | Паттерн «реальный Nest-контекст + проверка инвариантов» перерастить в настоящие тесты. В v1 не покрыт сам движок — в новой версии `engine-check` писать первым. |

---

## 5. ВЫБРОСИТЬ

- **Phase-0 демо-поверхность API**: `modules/journal` (дубль engine-журнала),
  `planning` (дубль engine-Lesson; метрики урока взять как view-логику),
  `teacher`, `materials` (stub), `reports` (хардкод `programProgress: 64`),
  `notes` — тривиальный CRUD/заглушки.
- **`modules/pilot/` + `PilotInvite`** — автором помечен «ВРЕМЕННЫЙ»; ценна только
  идея «форма сессии QR-пути = форма OIDC-сессии».
- **Демо-каскад данных**: `ChannelMembership`, `MealOrder` (status="DEFAULT").
- **`common/auth/dev-auth.guard.ts` + `teacher.decorator.ts`** — мёртвый/legacy слой.
- **Фронт-дубли**: одна из двух дизайн-систем (база — `admin/ds`: больше готовых
  компонентов; рукописные SVG-иконки `design/Icon.tsx` → lucide); 3 из 4
  HTTP-клиентов (`api.ts`, `pilotApi.ts`, `structureApi.ts` → свернуть в
  `http.ts`); `MVoice`≡`VoiceOverlay` (один компонент в двух файлах);
  параллельный `mobile/` слой (→ адаптивные представления над общими хуками);
  самодельный роутинг по URLSearchParams (+ аккорд Ctrl+X+R+T+J).
- **CI** — пересобрать: сейчас только «компилируется», нет lint/test/typecheck/
  проверки миграций, ASR не собирается.

---

## 6. Порядок сборки новой версии (рекомендация)

Не «с нуля», а слоями из проверенных кусков, с тестом на каждый инвариант:

1. **Kernel first**: events + outbox/inbox + tenant (на `$extends`/RLS) + storage
   + Prisma-фундамент (tenant-кластер + event-таблицы). Сразу — тесты на
   fail-closed изоляцию, идемпотентность inbox, depth-guard (в v1 эти инварианты
   держались только на ревью).
2. **Identity**: один SessionUser, BFF-OIDC по ADR-0005, RBAC-механика из authz
   (+кэш), entitlements.
3. **Одна модель домена** (конец двоевластию): журнал = `JournalCell`/`grade.posted`,
   урок = engine Lesson FSM, материалы = doc-контур. Phase-0 модели не переносить.
4. **Движок** переносится как есть концептуально, закрывая помеченные стабы
   (реальный календарь дат, OrgStandards-констрейнты в Solver, затухание ИОМ) —
   и первым получает интеграционный тест пайплайна КТП→Solver→КПП→урок.
5. **Фронт**: один реестр (обобщённый SectionDescriptor на все кабинеты), одна ДС
   (база `admin/ds` + токены/prefs из `design`), один HTTP-слой (`http.ts`),
   shared-контракт генерировать из схемы (Prisma→zod), нормальный роутер,
   mobile как responsive-представления.
6. **Периферия по мере надобности**: ASR (копировать), doc/textbook, comm
   (инварианты дословно), consent, параметры по приоритету PARAMETERS.md §5.

Правила, которые в v1 декларированы, но не удержались — в новой версии закрепить
механически, не дисциплиной: линт границ модулей (eslint-boundaries), запрет
двух реализаций одного понятия, CI с тестами инвариантов, shared-контракт
генерируется (не пишется руками).

---

*Детальные вердикты по каждому файлу — в отчётах аудита (ядро backend: 43 файла;
доменные модули: 22 модуля; фронтенд: ~8k строк; схема: 71 модель, 23 миграции).*
