-- Aufteilung eines Zeiteintrags auf mehrere Leistungen (z. B. von der KI aus dem Bautagebuch ermittelt):
-- [{"gewerk":"Sanitär","leistung":"Wasserleitungen verlegen","minuten":180}, ...]
alter table public.bau_eintraege add column if not exists aufteilung jsonb;
