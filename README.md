# ✂️ Golden Blade — Telegram Mini App для барбершопа

Премиальное TMA-приложение записи в барбершоп: тёмный Black/Gold дизайн, выбор мастера,
каталог услуг с ценами и длительностью, интерактивный календарь со свободными слотами,
бронирование через Supabase.

## Стек
- **Frontend:** чистый HTML + Tailwind CSS (CDN) + Vanilla JS
- **Telegram:** [telegram-web-app.js](https://core.telegram.org/bots/webapps) — MainButton, HapticFeedback, themeParams, initData
- **Backend:** Supabase (PostgREST, RLS)
- **Хостинг:** Cloudflare Pages

## Структура
```
index.html          — разметка и Tailwind-конфиг
styles.css          — анимации, календарь, слоты, safe-area
app.js              — логика: данные, календарь, слоты, MainButton, запись
config.js           — SUPABASE_URL / SUPABASE_ANON_KEY
supabase/schema.sql — таблицы masters / services / appointments + RLS + демо-данные
_headers            — заголовки безопасности для Cloudflare Pages
```

## Запуск

### 1. Supabase
1. Создайте проект на [supabase.com](https://supabase.com).
2. SQL Editor → выполните `supabase/schema.sql`.
3. Project Settings → API → скопируйте **URL** и **anon public key** в `config.js`.

Без ключей приложение работает в **демо-режиме** на встроенных данных.

### 2. Cloudflare Pages
1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Выберите этот репозиторий.
3. Build settings: **Framework preset: None**, build command — пусто, output dir — `/` (корень).
4. Deploy. Файл `_headers` применится автоматически.

### 3. Telegram Bot
1. [@BotFather](https://t.me/BotFather) → `/newbot` → `/newapp` (Menu Button / Web App).
2. Укажите URL из Cloudflare Pages (обязателен HTTPS).
3. Откройте приложение из меню бота — MainButton «ЗАПИСАТЬСЯ» появится автоматически.

## Безопасность
- RLS включён: чтение каталогов открыто, записи — insert-only для anon-ключа.
- Уникальный индекс `(master_id, date, time)` не даёт забронировать занятый слот.
- `initDataUnsafe` используется только для приветствия; валидация `initData` на сервере — при подключении Edge Function.
