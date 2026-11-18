-- Rapport-App: Durchschlag (fertiges Rapport-PDF mit beiden Unterschriften) für den Unterzeichner zum Abholen per Link.
-- Zeile mit daten.art = 'durchschlag', PDF als Base64; Ablauf 30 Tage. Zugriff nur über die Edge Function.
alter table public.rapport_signaturen add column if not exists pdf text;
