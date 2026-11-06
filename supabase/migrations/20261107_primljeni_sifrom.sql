-- ============================================================
-- PODACI POD ŠIFROM — slanje traga/poligona/KML-a bilo kome (terenski profil,
-- druga šumarija), uz šifru koja važi 2 dana (v3.5.0). Dopuna uz
-- 20261106_primljeni_podaci.sql (slanje poznatom kolegi iz iste šumarije).
--
--   • pošiljalac pozove posalji_podatke_sifrom() → dobije šifru (8 znakova)
--   • primalac unese šifru: preuzmi_podatke_sifrom() vrati podatak i "zaključa"
--     ga za njega; tek kad app SPREMI podatak lokalno, javi
--     potvrdi_preuzimanje_sifrom() i red se briše sa servera
--   • šifra je JEDNOKRATNA (drugi korisnik je ne može preuzeti poslije prvog)
--     i ističe za 2 dana; pogrešni pokušaji su ograničeni (10 u 10 min)
--
-- Tabele nemaju NIJEDNU politiku — pristup je isključivo kroz funkcije ispod,
-- pa niko ne može nabrajati tuđe šifre ni sadržaj. Pogađanje: 31^8 ≈ 8,5·10^11
-- mogućnosti + ograničenje pokušaja + 2 dana roka.
--
-- Idempotentna. Pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create table if not exists public.podaci_sifre (
  sifra      text primary key check (sifra ~ '^[A-HJKMNP-Z2-9]{8}$'),
  from_id    uuid not null references auth.users(id) on delete cascade,
  od_ime     text,
  vrsta      text not null check (vrsta in ('trag', 'poligon', 'linija', 'kml')),
  naziv      text not null check (char_length(naziv) between 1 and 120),
  sadrzaj    text not null check (char_length(sadrzaj) <= 3000000),
  claimed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 days'
);
create index if not exists podaci_sifre_istek_idx on public.podaci_sifre (expires_at);
create index if not exists podaci_sifre_from_idx on public.podaci_sifre (from_id);
alter table public.podaci_sifre enable row level security;   -- bez politika: sve kroz funkcije

create table if not exists public.podaci_sifre_pokusaji (
  uid uuid not null,
  t   timestamptz not null default now()
);
create index if not exists podaci_sifre_pokusaji_idx on public.podaci_sifre_pokusaji (uid, t);
alter table public.podaci_sifre_pokusaji enable row level security;

create or replace function public.posalji_podatke_sifrom(
  p_vrsta   text,
  p_naziv   text,
  p_sadrzaj text
)
returns text language plpgsql security definer
set search_path = public, auth as $$
declare
  v_abc  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_ime  text;
  v_kod  text;
  v_raw  bytea;
  i      int;
  n      int := 0;
begin
  if auth.uid() is null or not public.je_odobren() then
    raise exception 'Nemaš pristup';
  end if;
  if p_vrsta not in ('trag', 'poligon', 'linija', 'kml') then
    raise exception 'Nepoznata vrsta podatka';
  end if;
  if p_naziv is null or char_length(btrim(p_naziv)) = 0 or char_length(p_naziv) > 120 then
    raise exception 'Neispravan naziv';
  end if;
  if p_sadrzaj is null or char_length(p_sadrzaj) = 0 or char_length(p_sadrzaj) > 3000000 then
    raise exception 'Podatak je prazan ili prevelik (najviše 3 MB)';
  end if;

  delete from public.podaci_sifre where expires_at < now();
  delete from public.podaci_sifre_pokusaji where t < now() - interval '1 day';

  if (select count(*) from public.podaci_sifre where from_id = auth.uid()) >= 10 then
    raise exception 'Imaš 10 aktivnih šifri — sačekaj da ih preuzmu ili isteknu';
  end if;

  select btrim(coalesce(k.ime, '') || ' ' || coalesce(k.prezime, '')) into v_ime
    from public.korisnici k where k.id = auth.uid();

  loop
    -- CSPRNG: bajtovi iz gen_random_uuid() (pg_strong_random), mapirani na 31 znak
    v_raw := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_kod := '';
    for i in 0..7 loop
      v_kod := v_kod || substr(v_abc, (get_byte(v_raw, i) % 31) + 1, 1);
    end loop;
    begin
      insert into public.podaci_sifre (sifra, from_id, od_ime, vrsta, naziv, sadrzaj)
      values (v_kod, auth.uid(), nullif(v_ime, ''), p_vrsta, btrim(p_naziv), p_sadrzaj);
      return v_kod;
    exception when unique_violation then
      n := n + 1;
      if n > 5 then raise exception 'Šifra nije napravljena — pokušaj ponovo'; end if;
    end;
  end loop;
end;
$$;

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

  -- Neuspjeh se NE javlja izuzetkom: izuzetak poništava transakciju pa se pokušaj ne bi
  -- upisao i ograničenje bi bilo bez efekta. Prazan rezultat = nepoznata, istekla ili tuđa šifra.
  select * into r from public.podaci_sifre s where s.sifra = v_s and s.expires_at > now() for update;
  if not found or (r.claimed_by is not null and r.claimed_by <> auth.uid()) then
    insert into public.podaci_sifre_pokusaji (uid) values (auth.uid());
    return;
  end if;
  update public.podaci_sifre s set claimed_by = auth.uid() where s.sifra = v_s;
  return query select r.vrsta, r.naziv, r.sadrzaj, r.od_ime;
end;
$$;

create or replace function public.potvrdi_preuzimanje_sifrom(p_sifra text)
returns void language plpgsql security definer
set search_path = public, auth as $$
declare
  v_s text := upper(regexp_replace(coalesce(p_sifra, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then return; end if;
  delete from public.podaci_sifre where sifra = v_s and claimed_by = auth.uid();
end;
$$;

revoke all on function public.posalji_podatke_sifrom(text, text, text) from public;
revoke all on function public.preuzmi_podatke_sifrom(text) from public;
revoke all on function public.potvrdi_preuzimanje_sifrom(text) from public;
grant execute on function public.posalji_podatke_sifrom(text, text, text) to authenticated;
grant execute on function public.preuzmi_podatke_sifrom(text) to authenticated;
grant execute on function public.potvrdi_preuzimanje_sifrom(text) to authenticated;

notify pgrst, 'reload schema';
