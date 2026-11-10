-- Rapport-App: Wohin der Einsatzbetrieb (Polier) seinen Durchschlag bekommen möchte.
alter table public.rapport_signaturen add column if not exists kopie_email text;
alter table public.rapport_signaturen add column if not exists kopie_tel text;
