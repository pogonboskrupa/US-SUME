-- ============================================================
-- ŠIFRA ZA VIŠE KORISNIKA (v3.5.7) — dopuna 20261107_primljeni_sifrom.sql.
--
-- Do sada je šifra bila JEDNOKRATNA: prvi koji je preuzme ju je "zaključao", a
-- potvrda preuzimanja je brisala red sa servera. Sad:
--   • istu šifru može preuzeti VIŠE korisnika (cijela ekipa sa jednom porukom)
--   • red ostaje aktivan do isteka (2 dana od slanja) — briše se tek tada
--   • ograničenje pogrešnih pokušaja ostaje (10 u 10 min po korisniku)
-- potvrdi_preuzimanje_sifrom() više ne briše ništa (stariji APK je i dalje zove).
--
-- Idempotentna. Pokreće se RUČNO u Supabase SQL Editoru (poslije 20261107).
-- ============================================================

create or replace function public.preuzmi_podatke_sifrom(p_sifra text)
returns table (vrsta text, naziv text, sadrzaj text, od_ime text)
language plpgsql security definer
set search_path = public, auth as $$
declare
  v_s text := upper(regexp_replace(coalesce(p_sifra, ''), '[^A-Za-z0-9]', '', 'g'));
  r   public.podaci_sifre%rowtype;
begin
  if auth.uid() is null or not public.je_odobren() then
    raise exception 'Nemaš pristup';
  end if;
  if (select count(*) from public.podaci_sifre_pokusaji where uid = auth.uid() and t > now() - interval '10 minutes') >= 10 then
    raise exception 'Previše pogrešnih pokušaja — pokušaj za nekoliko minuta';
  end if;
  delete from public.podaci_sifre where expires_at < now();

  -- Neuspjeh se NE javlja izuzetkom (izuzetak bi poništio upis pokušaja).
  select * into r from public.podaci_sifre s where s.sifra = v_s and s.expires_at > now();
  if not found then
    insert into public.podaci_sifre_pokusaji (uid) values (auth.uid());
    return;
  end if;
  return query select r.vrsta, r.naziv, r.sadrzaj, r.od_ime;
end;
$$;

create or replace function public.potvrdi_preuzimanje_sifrom(p_sifra text)
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  -- Namjerno ništa: šifra važi za više korisnika do isteka (red se briše po expires_at).
  return;
end;
$$;

revoke all on function public.preuzmi_podatke_sifrom(text) from public;
revoke all on function public.potvrdi_preuzimanje_sifrom(text) from public;
grant execute on function public.preuzmi_podatke_sifrom(text) to authenticated;
grant execute on function public.potvrdi_preuzimanje_sifrom(text) to authenticated;

notify pgrst, 'reload schema';
