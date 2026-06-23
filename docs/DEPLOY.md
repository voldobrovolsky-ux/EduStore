# Деплой EduStore на VPS (РФ)

Стек на одном сервере: **Caddy** (443, авто-SSL Let's Encrypt) → **web** (nginx: SPA + проксирование
`/api`) → **api** (NestJS+Prisma) → **postgres**; плюс **asr** (faster-whisper). Домен:
`edustore-flor-group.ru`.

## 0. Предусловия
- VPS в РФ (Yandex Cloud / VK / Selectel — реестр/152-ФЗ), Ubuntu 22.04+, 2–4 vCPU / 4–8 ГБ.
- DNS: `A`-запись `edustore-flor-group.ru` → IP сервера (для авто-SSL Caddy).
- Docker + Docker Compose v2: `curl -fsSL https://get.docker.com | sh`.
- Открыты порты 80, 443.

## 1. Код и переменные
```bash
git clone <repo> edustore && cd edustore
cp .env.prod.example .env.prod   # затем заполнить (см. ниже)
```

`.env.prod` (минимум):
```bash
POSTGRES_USER=edustore
POSTGRES_PASSWORD=<сильный-пароль>
POSTGRES_DB=edustore
ASR_MOCK=0                       # 1 — без модели (демо); 0 — реальный faster-whisper
# Флёрус (ADR-0005) — после регистрации клиента
FLOR_ISSUER=https://accounts.flor-group.ru
FLOR_CLIENT_ID=edustore
FLOR_CLIENT_SECRET=<секрет из регистрации>
```

## 2. Запуск
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
Миграции применяются автоматически (`prisma migrate deploy` в CMD api). Caddy сам выпустит
TLS-сертификат для домена при первом запросе.

Первый деплой — засеять демо-структуру (опционально, для проверки кабинетов):
```bash
docker compose -f docker-compose.prod.yml exec api npm run seed
```

## 3. Проверка
```bash
curl -s https://edustore-flor-group.ru/api/teacher/profile   # API за прокси
# открыть https://edustore-flor-group.ru — SPA
```

## 4. Обновление
```bash
git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## 5. Что ещё понадобится (по мере подключения)
- **S3** (Yandex Object Storage) для файлов/учебников — env `S3_*` (когда появится файлохранилище).
- **AI-ключи** (YandexGPT/DeepSeek) для генерации КТП/материалов — env, маршрутизация по 152-ФЗ
  (см. план тестирования/персонализации).
- **Регистрация Флёрус-клиента** (`edustore`) с redirect `https://edustore-flor-group.ru/api/auth/flor/callback`
  и backchannel `…/api/auth/flor/backchannel-logout` (ADR-0005 §регистрация).
- **Бэкапы Postgres**: `pg_dump` по cron (том `pgdata`).

## Заметки
- ASR в проде: `ASR_MOCK=0` тянет модель faster-whisper при старте (или смонтируйте предзагруженную
  в `services/asr/models`). CPU достаточно для коротких фраз (см. INFRA.md).
- Dockerfile'ы рассчитаны на сборку из корня монорепо (workspaces). Валидируйте первую сборку на сервере.
