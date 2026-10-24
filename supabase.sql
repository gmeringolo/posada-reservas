-- =====================================================================
--  Posada reservas — estructura de la base de datos en Supabase
--  Copiá TODO este archivo en Supabase → SQL Editor → New query → Run
-- =====================================================================

-- 1) Extensión necesaria para impedir reservas superpuestas
create extension if not exists btree_gist;

-- 2) Tabla de reservas
create table if not exists public.reservas (
  id            uuid primary key default gen_random_uuid(),
  casa          text not null check (casa in ('roja','azul','verde','mostaza')),
  inicio        date not null,                 -- día de entrada
  fin           date not null,                 -- día de salida (check-out)
  nombre        text not null,
  apellido      text,
  telefono      text not null,
  moneda        text not null default 'USD' check (moneda in ('USD','UYU')),
  precio_noche  numeric(10,2) check (precio_noche >= 0),
  total         numeric(10,2) check (total >= 0),
  senia         numeric(10,2),
  adultos       integer not null default 1 check (adultos >= 0),
  ninos         integer not null default 0 check (ninos >= 0),
  comentarios   text,
  creada        timestamptz not null default now(),
  actualizada   timestamptz not null default now(),
  constraint fechas_validas check (fin > inicio),
  constraint reservas_senia_dentro_del_total check (senia is null or (senia >= 0 and (total is null or senia <= total))),
  -- La base rechaza dos reservas que se pisen en la misma casa,
  -- aunque las dos personas guarden al mismo tiempo.
  -- El día de salida de una puede ser el de entrada de la siguiente.
  constraint sin_superposicion exclude using gist (
    casa with =,
    daterange(inicio, fin, '[)') with &&
  )
);

-- Actualiza también las tablas existentes sin perder reservas.
alter table public.reservas alter column apellido drop not null;
alter table public.reservas alter column precio_noche drop not null;
alter table public.reservas alter column total drop not null;
alter table public.reservas add column if not exists senia numeric(10,2);
alter table public.reservas alter column senia drop not null;
alter table public.reservas alter column senia drop default;
alter table public.reservas add column if not exists adultos integer not null default 1;
alter table public.reservas add column if not exists ninos integer not null default 0;
alter table public.reservas add column if not exists comentarios text;
alter table public.reservas drop constraint if exists reservas_adultos_no_negativos;
alter table public.reservas add constraint reservas_adultos_no_negativos check (adultos >= 0);
alter table public.reservas drop constraint if exists reservas_ninos_no_negativos;
alter table public.reservas add constraint reservas_ninos_no_negativos check (ninos >= 0);
alter table public.reservas drop constraint if exists reservas_senia_dentro_del_total;
alter table public.reservas add constraint reservas_senia_dentro_del_total
  check (senia is null or (senia >= 0 and (total is null or senia <= total)));

create index if not exists reservas_inicio_idx on public.reservas (inicio);

-- 3) Actualizaciones en tiempo real (para que el otro celular se entere solo)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservas'
  ) then
    alter publication supabase_realtime add table public.reservas;
  end if;
end
$$;

-- 4) Seguridad (Row Level Security)
alter table public.reservas enable row level security;

-- Los permisos SQL y las políticas RLS son controles distintos: se necesitan ambos.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.reservas to authenticated;

-- 5) Permisos: solo el usuario que ingresa con login puede ver y cargar reservas.
--    Quien abra la web sin ingresar no ve nada (ni nombres ni teléfonos).
drop policy if exists "acceso_publico" on public.reservas;
drop policy if exists "solo_usuarias" on public.reservas;
create policy "solo_usuarias" on public.reservas
  for all to authenticated
  using (true) with check (true);

-- 6) El usuario NO se crea acá: crealo desde Authentication → Users → Add user
--    Email: posada@example.com   ·   Password: la contraseña elegida
--    (ver README, paso 1)
