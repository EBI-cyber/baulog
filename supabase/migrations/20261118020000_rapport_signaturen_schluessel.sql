-- Rapport-App: Kontroll-Link nachführen. Nur wer den Schlüssel hat (die App des Mitarbeiters), darf den Rapport-
-- Schnappschuss aktualisieren, solange noch nicht unterschrieben ist. Der Unterzeichner kennt nur den Token.
alter table public.rapport_signaturen add column if not exists schluessel text;
