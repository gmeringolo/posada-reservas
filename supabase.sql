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
  ) deferrable initially immediate
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

-- La regla de no superposición se puede postergar hasta el final de una operación.
-- Así se pueden intercambiar las casas de dos reservas con las mismas fechas.
alter table public.reservas drop constraint if exists sin_superposicion;
alter table public.reservas add constraint sin_superposicion exclude using gist (
  casa with =,
  daterange(inicio, fin, '[)') with &&
) deferrable initially immediate;

create index if not exists reservas_inicio_idx on public.reservas (inicio);

-- Intercambio de casas: la reserva p_id pasa a la casa de p_otro (con los datos de p_datos)
-- y p_otro pasa a la casa original de p_id. Las dos tienen que tener las mismas fechas.
-- Todo se hace junto: si algo falla, no cambia nada.
create or replace function public.intercambiar_casas(p_id uuid, p_otro uuid, p_datos jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_casa_original text;
  v_otro public.reservas%rowtype;
begin
  set constraints sin_superposicion deferred;

  select casa into v_casa_original from public.reservas where id = p_id for update;
  select * into v_otro from public.reservas where id = p_otro for update;
  if v_casa_original is null or v_otro.id is null then
    raise exception 'Una de las reservas ya no existe' using errcode = 'PH001';
  end if;
  if v_otro.casa <> p_datos->>'casa'
     or v_otro.inicio <> (p_datos->>'inicio')::date
     or v_otro.fin <> (p_datos->>'fin')::date then
    raise exception 'Las fechas de las reservas ya no coinciden' using errcode = 'PH001';
  end if;

  update public.reservas set
    casa         = p_datos->>'casa',
    inicio       = (p_datos->>'inicio')::date,
    fin          = (p_datos->>'fin')::date,
    nombre       = p_datos->>'nombre',
    apellido     = p_datos->>'apellido',
    telefono     = p_datos->>'telefono',
    moneda       = p_datos->>'moneda',
    precio_noche = (p_datos->>'precio_noche')::numeric,
    total        = (p_datos->>'total')::numeric,
    senia        = (p_datos->>'senia')::numeric,
    adultos      = (p_datos->>'adultos')::integer,
    ninos        = (p_datos->>'ninos')::integer,
    comentarios  = p_datos->>'comentarios',
    actualizada  = now()
  where id = p_id;

  update public.reservas set casa = v_casa_original, actualizada = now() where id = p_otro;
end
$$;

revoke execute on function public.intercambiar_casas(uuid, uuid, jsonb) from public, anon;
grant execute on function public.intercambiar_casas(uuid, uuid, jsonb) to authenticated;

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
