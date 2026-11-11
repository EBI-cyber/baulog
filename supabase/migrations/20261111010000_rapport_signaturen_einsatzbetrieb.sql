-- Rapport-App: Angaben des Einsatzbetriebs auf dem Rapport (wie im Formular der Temporärbüros).
alter table public.rapport_signaturen add column if not exists bewertung integer;      -- Leistungsbeurteilung 1–5 (freiwillig)
alter table public.rapport_signaturen add column if not exists einsatz_weiter boolean; -- true: geht weiter, false: beendet
alter table public.rapport_signaturen add column if not exists beendet_am date;
