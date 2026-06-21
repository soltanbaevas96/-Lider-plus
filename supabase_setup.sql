-- ════════════════════════════════════════════════════════════════════
--  «Лидер Плюс» — настройка базы данных
--  Supabase → SQL Editor → New query → вставить всё → Run
-- ════════════════════════════════════════════════════════════════════

-- Записи клиентов
create table if not exists bookings (
  id            bigint generated always as identity primary key,
  consultant_id text not null,          -- symbat | aigerim
  slot_date     date not null,
  slot_time     text not null,
  name          text not null,
  phone         text not null,
  topic         text,
  grade         text,
  created_at    timestamptz default now(),
  unique (consultant_id, slot_date, slot_time)   -- защита от двойной записи
);

-- Расписание каждого консультанта
create table if not exists schedules (
  consultant_id text primary key,       -- symbat | aigerim
  data          jsonb not null
);

-- Доступ (приложение без логина, поэтому открытые политики)
alter table bookings  enable row level security;
alter table schedules enable row level security;

create policy "read bookings"   on bookings  for select using (true);
create policy "insert bookings" on bookings  for insert with check (true);
create policy "delete bookings" on bookings  for delete using (true);

create policy "read schedules"   on schedules for select using (true);
create policy "upsert schedules" on schedules for insert with check (true);
create policy "update schedules" on schedules for update using (true);
