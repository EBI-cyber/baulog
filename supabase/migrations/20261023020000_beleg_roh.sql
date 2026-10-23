-- Originalfoto und Ecken eines gescannten Belegs, damit sich der Zuschnitt später korrigieren lässt:
-- {"bild": "data:image/jpeg;base64,…", "ecken": [{"x":…,"y":…}, …]}
alter table public.bau_eintraege add column if not exists beleg_roh jsonb;
