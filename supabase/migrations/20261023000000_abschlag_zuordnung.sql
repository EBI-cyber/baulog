-- Jeder Eintrag merkt sich, mit welchem Abschlag (bau_rechnungen.token) er abgerechnet wurde.
-- Leer = noch nicht abgerechnet. Ein neuer Abschlag nimmt alle noch nicht abgerechneten Einträge.
alter table public.bau_eintraege add column if not exists abschlag_token text;
