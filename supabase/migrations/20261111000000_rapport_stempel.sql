-- Rapport-App: Stempeln per iPhone-Kurzbefehl (Rückseite tippen, Siri, Ort), ohne die App zu öffnen.
-- Der Kurzbefehl ruft die Edge Function „rapport-stempel“ mit einem persönlichen Schlüssel auf;
-- die App holt die Ereignisse beim Öffnen ab (mit der genauen Uhrzeit des Tippens).
-- Zugriff nur über die Edge Function (Service-Role): RLS an, keine Policies. Gespeichert wird nur der Hash des Schlüssels.
create table if not exists public.rapport_stempel_zustand (
  schluessel text primary key,            -- SHA-256 des persönlichen Schlüssels
  zustand text not null default 'aus',    -- aus | arbeit | pause
  geaendert timestamptz not null default now()
);
create table if not exists public.rapport_stempel_ereignisse (
  id bigserial primary key,
  schluessel text not null,
  aktion text not null,                   -- start | pause | weiter | stopp
  zeit timestamptz not null default now()
);
alter table public.rapport_stempel_zustand enable row level security;
alter table public.rapport_stempel_ereignisse enable row level security;
create index if not exists rapport_stempel_ereignisse_schluessel on public.rapport_stempel_ereignisse (schluessel, zeit);
