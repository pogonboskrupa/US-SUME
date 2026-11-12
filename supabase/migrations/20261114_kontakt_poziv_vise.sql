-- ============================================================
-- POZIV ZA KOLEGE: JEDAN KOD ZA VIŠE LJUDI (v4.1.1)
--
-- Do sada je kod poziva bio jednokratan: čim ga prvi kolega prihvati, briše se, pa je za
-- svakog kolegu trebao novi kod. Sada:
--   • kod važi 1 dan i može ga prihvatiti VIŠE ljudi (svako postaje kolega pozivaoca,
--     u oba smjera, kao i do sada)
--   • kontakt_poziv_napravi() vraća postojeći važeći kod pozivaoca umjesto da pravi novi
--     (isti kod se dijeli cijeloj ekipi); novi nastaje tek kad stari istekne
-- Idempotentna; pokreće se RUČNO u Supabase SQL Editoru (poslije 20261112_kontakti.sql).
-- ============================================================

create or replace function public.kontakt_poziv_napravi()
returns text language plpgsql security definer
set search_path = public, auth as $$
declare
  v_kod text; v_raw bytea; n int := 0;
begin
  if auth.uid() is null or not public.je_odobren() then raise exception 'Nemaš pristup'; end if;
  delete from public.kontakt_pozivi where expires_at < now();
  -- Važeći kod već postoji: isti se dijeli svima (najnoviji)
  select p.kod into v_kod from public.kontakt_pozivi p
   where p.from_id = auth.uid() order by p.expires_at desc limit 1;
  if v_kod is not null then return v_kod; end if;
  loop
    v_raw := decode(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'hex');
    v_kod := lpad(((get_byte(v_raw,0)::bigint * 16777216 + get_byte(v_raw,1) * 65536
                   + get_byte(v_raw,2) * 256 + get_byte(v_raw,3)) % 100000)::text, 5, '0');
    begin
      insert into public.kontakt_pozivi (kod, from_id) values (v_kod, auth.uid());
      return v_kod;
    exception when unique_violation then
      n := n + 1;
      if n > 20 then raise exception 'Poziv nije napravljen — pokušaj ponovo'; end if;
    end;
  end loop;
end; $$;

create or replace function public.kontakt_poziv_prihvati(p_kod text)
returns table (id uuid, ime text, sumarija text)
language plpgsql security definer
set search_path = public, auth as $$
declare
  v_k text := regexp_replace(coalesce(p_kod, ''), '[^0-9]', '', 'g');
  r public.kontakt_pozivi%rowtype;
begin
  if auth.uid() is null or not public.je_odobren() then raise exception 'Nemaš pristup'; end if;
  if (select count(*) from public.podaci_sifre_pokusaji where uid = auth.uid() and t > now() - interval '10 minutes') >= 10 then
    raise exception 'Previše pogrešnih pokušaja — pokušaj za nekoliko minuta';
  end if;
  delete from public.kontakt_pozivi where expires_at < now();
  select * into r from public.kontakt_pozivi p where p.kod = v_k;
  -- Neuspjeh se NE javlja izuzetkom (izuzetak bi poništio upis pokušaja)
  if not found or r.from_id = auth.uid() then
    insert into public.podaci_sifre_pokusaji (uid) values (auth.uid());
    return;
  end if;
  -- Veza u OBA smjera; kod se NE briše — važi do isteka i za ostale kolege
  insert into public.kontakti (a, b) values (auth.uid(), r.from_id) on conflict do nothing;
  insert into public.kontakti (a, b) values (r.from_id, auth.uid()) on conflict do nothing;
  return query select k.id, btrim(coalesce(k.ime,'') || ' ' || coalesce(k.prezime,'')), k.sumarija
    from public.korisnici k where k.id = r.from_id;
end; $$;

revoke all on function public.kontakt_poziv_napravi() from public;
revoke all on function public.kontakt_poziv_prihvati(text) from public;
grant execute on function public.kontakt_poziv_napravi() to authenticated;
grant execute on function public.kontakt_poziv_prihvati(text) to authenticated;
notify pgrst, 'reload schema';
