-- ============================================================
--  BauLog Team — Mitarbeiter pro Projekt (in Supabase ausführen)
-- ============================================================
create table if not exists public.bau_members (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projekt_token text not null,
  member_email text not null,
  created_at   timestamptz not null default now(),
  unique (projekt_token, member_email)
);

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
