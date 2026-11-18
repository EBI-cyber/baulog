-- Rapport-App: Einsatzbetrieb bestätigt beim Unterschreiben, dass sein Firmenstempel eingesetzt werden darf.
alter table public.rapport_signaturen add column if not exists stempel boolean;
