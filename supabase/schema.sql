-- ============================================================
-- Golden Blade Barbershop — Telegram Mini App
-- Supabase schema. Выполните целиком в SQL Editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Мастера ----------
create table if not exists public.masters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  specialty   text,
  rating      numeric(2,1) default 5.0 check (rating between 0 and 5),
  photo_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Услуги ----------
create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  price        integer not null check (price >= 0),        -- в рублях
  duration_min integer not null check (duration_min > 0),  -- длительность, мин
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------- Записи ----------
create table if not exists public.appointments (
  id                uuid primary key default gen_random_uuid(),
  client_name       text not null,
  client_phone      text not null,
  master_id         uuid references public.masters(id) on delete set null,
  service_id        uuid references public.services(id) on delete set null,
  master_name       text,   -- денормализация для истории
  service_name      text,
  price             integer,
  appointment_date  date not null,
  appointment_time  time not null,
  telegram_user_id  bigint,
  status            text not null default 'pending'
                    check (status in ('pending','confirmed','cancelled','completed')),
  created_at        timestamptz not null default now(),
  unique (master_id, appointment_date, appointment_time)  -- защита от двойного бронирования
);

create index if not exists idx_appointments_date   on public.appointments (appointment_date);
create index if not exists idx_appointments_master on public.appointments (master_id, appointment_date);

-- ---------- RLS ----------
alter table public.masters      enable row level security;
alter table public.services     enable row level security;
alter table public.appointments enable row level security;

-- Каталоги читают все (anon), записи — только создавать (insert) без чтения чужих данных
create policy "masters readable by all"   on public.masters   for select using (is_active);
create policy "services readable by all"  on public.services  for select using (is_active);
create policy "anyone can book"           on public.appointments for insert with check (true);

-- Управление записями (confirm/cancel) — только через service_role / Edge Function.

-- ---------- Демо-данные ----------
insert into public.masters (name, specialty, rating) values
  ('Артём «Бритва»',  'Классические стрижки, королевское бритьё', 4.9),
  ('Марко Веста',     'Фейды, борода, камуфляж седины',           4.8),
  ('Дмитрий Гросс',   'Авторские образы, укладки',                4.7);

insert into public.services (name, description, price, duration_min) values
  ('Мужская стрижка',     'Стрижка + укладка + консультация',      1800, 60),
  ('Королевское бритьё',  'Горячие полотенца, опасная бритва',     1500, 45),
  ('Стрижка + борода',    'Полный комплекс под ключ',              2600, 90),
  ('Оформление бороды',   'Контур, масло, стайлинг',               1200, 30),
  ('Детская стрижка',     'Для джентльменов до 12 лет',            1400, 45);
