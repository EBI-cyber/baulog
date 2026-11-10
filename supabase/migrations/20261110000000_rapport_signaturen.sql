-- Rapport-App: Unterschrift des Einsatzbetriebs per QR-Code auf dessen eigenem Handy.
-- Zwischenablage für einen Rapport-Schnappschuss (ohne Lohnangaben) und die Unterschrift.
-- Zugriff NUR über die Edge Function „rapport-signatur“ (Service-Role): RLS an, keine Policies.
create table if not exists public.rapport_signaturen (
  token text primary key,                  -- zufällig, 32 Hex-Zeichen, steht im QR-Code
  daten jsonb not null,                    -- Rapport-Schnappschuss zum Ansehen
  status text not null default 'offen',    -- offen | unterschrieben | abgelehnt
  bild text,                               -- Unterschrift (PNG-DataURL)
  name text,                               -- Name des Unterzeichners
  bemerkung text,                          -- bei „nicht einverstanden“
  erstellt timestamptz not null default now(),
  beantwortet timestamptz,
  ablauf timestamptz not null default now() + interval '14 days'
);
alter table public.rapport_signaturen enable row level security;
create index if not exists rapport_signaturen_ablauf on public.rapport_signaturen (ablauf);
