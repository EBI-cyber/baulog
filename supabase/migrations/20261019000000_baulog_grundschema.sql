-- Grundschema BauLog (Stand 2026-10-19): schema.sql + schema_team.sql zusammengeführt.
-- Idempotent — darf auch auf einer Datenbank laufen, in der Teile schon existieren.
-- Neue Datenbank-Änderungen IMMER als neue Datei in supabase/migrations/ anlegen,
-- sie werden beim Push auf main automatisch eingespielt (.github/workflows/deploy.yml).

-- ============================================================
--  BauLog — Cloud-Schema (in Supabase SQL Editor ausführen)
-- ============================================================
create extension if not exists "pgcrypto";

create table if not exists public.bau_projekte (
  token       text primary key,
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text,
  customer    text,
  address     text,
  hourly_rate numeric,
  status      text,
  created_at  timestamptz not null default now()
);

create table if not exists public.bau_eintraege (
  token        text primary key,
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projekt_token text,
  type         text,
  gewerk       text,
  leistung     text,
  einheit      text,
  menge        numeric,
  minutes      numeric,
  label        text,
  qty          numeric,
  unit_cost    numeric,
  maschine     text,
  satz         numeric,
  data_url     text,
  note         text,
  text         text,
  created_at   timestamptz not null default now()
);
-- Nachrüsten: echte Start-/Ende-Uhrzeit + Pausenzeiten für Zeit-Einträge (Timer)
alter table public.bau_eintraege add column if not exists start_at timestamptz;
alter table public.bau_eintraege add column if not exists end_at   timestamptz;
alter table public.bau_eintraege add column if not exists pausen   jsonb;

-- Rechnungen/Abrechnungszeiträume pro Projekt (Bezahlt-Status)
create table if not exists public.bau_rechnungen (
  token         text primary key,
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projekt_token text not null,
  von           date,
  bis           date,
  betrag        numeric,
  bezahlt       boolean not null default false,
  bezahlt_am    date,
  created_at    timestamptz not null default now()
);
-- Fortlaufende Abschnitt-Nr. + Saldo-Verrechnung zwischen Abschnitten
alter table public.bau_rechnungen add column if not exists nr               int;
alter table public.bau_rechnungen add column if not exists vorheriger_saldo numeric not null default 0;
alter table public.bau_rechnungen add column if not exists gesamtbetrag    numeric;
alter table public.bau_rechnungen add column if not exists bezahlter_betrag numeric not null default 0;
alter table public.bau_rechnungen add column if not exists saldo           numeric;

alter table public.bau_projekte   enable row level security;
alter table public.bau_eintraege  enable row level security;
alter table public.bau_rechnungen enable row level security;

drop policy if exists "bp_all_own" on public.bau_projekte;
create policy "bp_all_own" on public.bau_projekte for all using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "be_all_own" on public.bau_eintraege;
create policy "be_all_own" on public.bau_eintraege for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- Rechnungen sind Bezahl-/Kosteninfos: bewusst nur für den Projekt-Owner (Mitarbeiter sehen keine Kosten)
drop policy if exists "brc_all_own" on public.bau_rechnungen;
create policy "brc_all_own" on public.bau_rechnungen for all using (auth.uid() = owner) with check (auth.uid() = owner);

create index if not exists bau_projekte_owner_idx   on public.bau_projekte(owner);
create index if not exists bau_eintraege_owner_idx  on public.bau_eintraege(owner);
create index if not exists bau_rechnungen_owner_idx on public.bau_rechnungen(owner);

-- ============================================================
--  BauLog Team — Mitarbeiter pro Projekt (in Supabase ausführen)
-- ============================================================
create table if not exists public.bau_members (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projekt_token text not null,
  member_email text not null,
  gewerke      text[] not null default '{}',
  created_at   timestamptz not null default now(),
  unique (projekt_token, member_email)
);
-- Falls Tabelle schon existierte: Spalte nachrüsten (leer = alle Gewerke erlaubt)
alter table public.bau_members add column if not exists gewerke text[] not null default '{}';

-- Hilfsfunktionen (security definer -> umgehen RLS, keine Rekursion)
create or replace function public.is_project_member(p_token text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.bau_members m
    where m.projekt_token = p_token
      and lower(m.member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
create or replace function public.project_owner(p_token text) returns uuid
  language sql stable security definer set search_path = public as $$
  select owner from public.bau_projekte where token = p_token;
$$;

alter table public.bau_members enable row level security;
drop policy if exists "bm_select" on public.bau_members;
create policy "bm_select" on public.bau_members for select
  using (auth.uid() = owner or lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "bm_write" on public.bau_members;
create policy "bm_write" on public.bau_members for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- Projekte: Owner ODER zugewiesenes Mitglied darf LESEN; nur Owner ändert
drop policy if exists "bp_all_own" on public.bau_projekte;
drop policy if exists "bp_select" on public.bau_projekte;
create policy "bp_select" on public.bau_projekte for select using (auth.uid() = owner or public.is_project_member(token));
drop policy if exists "bp_insert" on public.bau_projekte;
create policy "bp_insert" on public.bau_projekte for insert with check (auth.uid() = owner);
drop policy if exists "bp_update" on public.bau_projekte;
create policy "bp_update" on public.bau_projekte for update using (auth.uid() = owner) with check (auth.uid() = owner);
drop policy if exists "bp_delete" on public.bau_projekte;
create policy "bp_delete" on public.bau_projekte for delete using (auth.uid() = owner);

-- Einträge: Owner ODER Mitglied liest; Mitglied darf einfügen (owner = Projekt-Owner)
drop policy if exists "be_all_own" on public.bau_eintraege;
drop policy if exists "be_select" on public.bau_eintraege;
create policy "be_select" on public.bau_eintraege for select using (auth.uid() = owner or public.is_project_member(projekt_token));
drop policy if exists "be_insert" on public.bau_eintraege;
create policy "be_insert" on public.bau_eintraege for insert
  with check (auth.uid() = owner or (public.is_project_member(projekt_token) and owner = public.project_owner(projekt_token)));
drop policy if exists "be_update" on public.bau_eintraege;
create policy "be_update" on public.bau_eintraege for update using (auth.uid() = owner or public.is_project_member(projekt_token));
drop policy if exists "be_delete" on public.bau_eintraege;
create policy "be_delete" on public.bau_eintraege for delete using (auth.uid() = owner or public.is_project_member(projekt_token));
