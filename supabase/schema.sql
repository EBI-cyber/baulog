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
