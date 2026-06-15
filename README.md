# EduStore

Образовательная экосистема для школ (B2B SaaS). Этот репозиторий содержит
стратегический аудит продукта и реализацию **кабинета учителя**.

## Структура (модульный монорепо)

```
docs/            — стратегический аудит, ADR, инфраструктура
apps/api/        — backend: NestJS + Prisma + PostgreSQL
apps/web/        — frontend: React + TypeScript + Vite (кабинет учителя)
services/asr/    — голосовой ввод: faster-whisper (FastAPI)
packages/shared/ — общие TS-контракты фронт↔бэк
docker-compose.yml
```

## Документы
- [Аудит](docs/AUDIT.md) — фичи, рынок, стоимость, инфраструктура, стратегия.
- [Архитектура](docs/ARCHITECTURE.md) — модульность + **как добавить новый раздел**.
- [Инфраструктура](docs/INFRA.md) — sizing и тарифы Yandex Cloud.
- [ADR](docs/adr/) — ключевые архитектурные решения.

## Быстрый старт (dev)

```bash
# всё разом
docker compose up

# или по отдельности
cd apps/api  && npm install && npx prisma migrate dev && npm run seed && npm run start:dev
cd apps/web  && npm install && npm run dev
cd services/asr && pip install -r requirements.txt && uvicorn main:app --reload --port 8001
```

- web: http://localhost:5173
- api: http://localhost:3000/api
- asr: http://localhost:8001

## Принципы реализации
1. **Модульность без монолита-кома** — домены изолированы, новый раздел = папка +
   одна запись в реестре (см. ARCHITECTURE.md).
2. **Дизайн по референсу** — токены/компоненты/состояния из дизайн-системы.
3. **Мягкая деградация** — голос/ASR недоступен → журнал работает вручную.
