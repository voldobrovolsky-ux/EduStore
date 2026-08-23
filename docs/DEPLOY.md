# Деплой на VPS (РФ)

## Schoolium 1.1.1 — первый запуск школы

Кратчайший путь «чистый VPS → школа, в которой можно работать». Всё остальное в
этом файле — вытесняемый контур (Флёрус OIDC, голосовой ввод); для 1.1.1 оно не
нужно и по умолчанию не поднимается.

```bash
git clone <repo> schoolium && cd schoolium
git checkout edustore-final-edition
cp .env.prod.example .env.prod && $EDITOR .env.prod   # POSTGRES_PASSWORD, SITE_DOMAIN, WEB_ORIGIN

# стек: postgres + api + web + Caddy(авто-SSL). ASR не собирается.
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile caddy up -d --build

# завести школу и модератора — печатает одноразовую ссылку входа на 24 часа
docker compose -f docker-compose.prod.yml exec api \
  npm run school:bootstrap -- --phone=+79990000000 --school="Школа №17" --name="Иванова Мария"
```

Миграции применяются сами при старте контейнера (`prisma migrate deploy`), сида
для 1.1.1 нет и не нужно: школа заводится командой выше, всё остальное вводит
модератор с экранов.

Ссылку из последней команды отдать модератору. Дальше он идёт по онбордингу
сам: классы → предметы → персонал (QR-активация) → привязка педагогов →
настройка расписания → автогенерация → журнал.

### Три места, где деплой ломается молча

| Что | Симптом | Как не наступить |
|---|---|---|
| `WEB_ORIGIN` не совпадает с реальным адресом | `school:bootstrap` печатает ссылку на чужой домен — модератор не входит | Заполнить `WEB_ORIGIN` **до** первого прогона bootstrap |
| Стенд без TLS (по IP) | Вход проходит, но возвращает на форму: браузер не сохраняет `secure`-cookie | Поднять с доменом и Caddy. Если TLS сегодня нет — `COOKIE_INSECURE=1` в `.env.prod`, **только для демо, не с данными живой школы** |
| Порт 80/443 занят хостовым nginx | Caddy не стартует | Вариант А ниже: без `--profile caddy`, фронт-дверь — хостовый nginx |

### Что уже работает в этой версии

23 экрана, десктоп и телефон. Онбординг школы целиком, расписание с проверкой
СанПиН, журнал: календарь недель с автооткрытием текущей, отметки, средний балл
за четверть и выходящая четвертная. Шесть ролей, кабинет управления — у
модератора. PWA: выносится иконкой на рабочий стол, вход по QR читается и на
iPhone.

Чего нет и что добавляется инкрементами: домашнее задание, замена и отмена
урока, сводки завуча, кабинеты детей и родителей (1.1.3). Полный список
открытых мест — `specs/school-onboarding/91-walkthrough.md` §3.

---

## Вытесняемый контур: полный стек EduStore

Стек на одном сервере: **reverse-proxy** (443, TLS) → **web** (nginx: SPA + проксирование
`/api`) → **api** (NestJS+Prisma) → **postgres**; плюс **asr** (faster-whisper). Домен:
`edustore-flor-group.ru`.

Фронт-дверь — на выбор:
- **Вариант А — хостовый nginx** (если nginx уже стоит на сервере): он держит 80/443 и TLS,
  а compose публикует web/api **только на `127.0.0.1`**. Caddy не запускаем. Конфиг —
  `deploy/nginx/edustore.conf`.
- **Вариант Б — встроенный Caddy** (чистый VPS без своего nginx): авто-SSL, запускается профилем
  `--profile caddy`.

> Порты api/web публикуются только на loopback (`127.0.0.1:3000`, `127.0.0.1:8080`) — наружу их
> отдаёт reverse-proxy с TLS. Прямо в интернет контейнеры не торчат.

## 0. Предусловия
- VPS в РФ (Yandex Cloud / VK / Selectel — реестр/152-ФЗ), Ubuntu 22.04+, 2–4 vCPU / 4–8 ГБ.
- DNS: `A`-запись `edustore-flor-group.ru` → IP сервера.
- Docker + Docker Compose v2: `curl -fsSL https://get.docker.com | sh`.
- Открыты порты 80, 443 (их слушает reverse-proxy: хостовый nginx или Caddy).

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

**Вариант А — хостовый nginx** (рекомендуется, если nginx уже стоит):
```bash
# 1) поднять стек (web→127.0.0.1:8080, api→127.0.0.1:3000; Caddy не стартует)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 2) настроить nginx как фронт-дверь (один upstream на web-контейнер)
sudo cp deploy/nginx/edustore.conf /etc/nginx/sites-available/edustore.conf
sudo ln -s /etc/nginx/sites-available/edustore.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d edustore-flor-group.ru      # TLS-сертификат
sudo nginx -t && sudo systemctl reload nginx
```
Хостовый nginx проксирует ВСЁ на `127.0.0.1:8080` (web-контейнер сам отдаёт SPA и `/api`).
Это и чинит 502: до этого nginx бил в `localhost:3000`, который не был опубликован наружу.

**Вариант Б — встроенный Caddy** (чистый VPS, авто-SSL):
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile caddy up -d --build
```

Миграции применяются автоматически (`prisma migrate deploy` в CMD api).

Первый деплой — засеять демо-структуру (опционально, для проверки кабинетов):
```bash
docker compose -f docker-compose.prod.yml exec api npm run seed
```

## 3. Проверка
```bash
# из контейнера/локально (loopback): API жив
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/auth/flor/me   # 401 без сессии — норм
# снаружи через домен: SPA + API за прокси
curl -s -o /dev/null -w "%{http_code}\n" https://edustore-flor-group.ru/api/auth/flor/me  # 401 — норм
# открыть https://edustore-flor-group.ru — лендинг; «Войти» → вход через Флёрус
```

**Проверка редиректа по роли** (после входа должен открыться нужный кабинет):
```bash
docker compose -f docker-compose.prod.yml logs api | grep "provision"
# provision sub=… role=admin org=… florus_orgs=1   → откроется кабинет администратора
```
Если `role=teacher` и `florus_orgs=0` — Флёрус не отдаёт роли: проверьте, что у клиента `edustore`
включены scope `flor:org`/`flor:roles`, а вы добавлены в орг с ролью `admin` (онбординг §6).

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
