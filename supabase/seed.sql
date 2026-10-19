-- ============================================================
--  BauLog — lokale Testdaten (NUR für `supabase start` / `supabase db reset`)
--  Wird nie auf das Live-Projekt angewendet.
--
--  Test-Logins (Passwort jeweils: test1234)
--    chef@baulog.test         -> Owner, besitzt das Testprojekt
--    mitarbeiter@baulog.test  -> Worker, im Testprojekt für Gewerk "Sanitär" eingetragen
-- ============================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'chef@baulog.test', crypt('test1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'mitarbeiter@baulog.test', crypt('test1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into public.bau_projekte (token, owner, name, customer, address, hourly_rate, status) values
  ('test-projekt-1', '11111111-1111-1111-1111-111111111111', 'Testprojekt Badsanierung', 'Familie Muster', 'Musterstraße 1, 12345 Musterstadt', 55, 'aktiv')
on conflict (token) do nothing;

insert into public.bau_eintraege (token, owner, projekt_token, type, gewerk, leistung, einheit, menge, minutes, text, created_at) values
  ('test-eintrag-1', '11111111-1111-1111-1111-111111111111', 'test-projekt-1', 'zeit',     'Sanitär', null, null, null, 190, null, now() - interval '2 days'),
  ('test-eintrag-2', '11111111-1111-1111-1111-111111111111', 'test-projekt-1', 'tagebuch', 'Sanitär', null, null, null, null, 'Wasserleitungen an I-Box angeschlossen.', now() - interval '2 days')
on conflict (token) do nothing;

insert into public.bau_members (owner, projekt_token, member_email, gewerke) values
  ('11111111-1111-1111-1111-111111111111', 'test-projekt-1', 'mitarbeiter@baulog.test', '{Sanitär}')
on conflict (projekt_token, member_email) do nothing;
