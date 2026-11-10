-- Rapport-App: Wer hat für den Einsatzbetrieb unterschrieben (Funktion, bekannte Person aus der Liste).
alter table public.rapport_signaturen add column if not exists funktion text;
alter table public.rapport_signaturen add column if not exists unterschreiber_id text;
