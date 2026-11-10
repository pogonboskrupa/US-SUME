-- ============================================================
-- KRATKA ŠIFRA (v3.9.1) — dopuna 20261107_primljeni_sifrom.sql.
--
-- Terenski profil šalje podatke SAMO šifrom, pa šifra mora biti laka za
-- diktiranje/ukucavanje na terenu: 5 cifara (npr. 48213) umjesto 8 znakova.
--   • nove šifre su 5 cifara (CSPRNG); već izdate 8-znakovne važe do isteka
--   • prostor od 100 000 je mali, zato se oslanjamo na: ograničenje pogrešnih
--     pokušaja (10 u 10 min po korisniku), rok od 2 dana i broj aktivnih šifri.
--     Zato se i ne izdaje nova šifra dok ih je aktivno više od 2000 (zaštita
--     da prostor ne postane pregusto popunjen).
--
-- Idempotentna. Pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

alter table public.podaci_sifre drop constraint if exists podaci_sifre_sifra_check;
alter table public.podaci_sifre
  add constraint podaci_sifre_sifra_check
  check (sifra ~ '^[0-9]{5}$' or sifra ~ '^[A-HJKMNP-Z2-9]{8}$');

create or replace function public.posalji_podatke_sifrom(
  p_vrsta   text,
  p_naziv   text,
  p_sadrzaj text
)
returns text language plpgsql security definer
set search_path = public, auth as $$
declare
  v_ime  text;
  v_kod  text;
  v_raw  bytea;
  v_br   bigint;
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
  if (select count(*) from public.podaci_sifre where sifra ~ '^[0-9]{5}$') >= 2000 then
    raise exception 'Previše aktivnih šifri — pokušaj ponovo za nekoliko sati';
  end if;

  select btrim(coalesce(k.ime, '') || ' ' || coalesce(k.prezime, '')) into v_ime
    from public.korisnici k where k.id = auth.uid();

  loop
    -- CSPRNG (gen_random_uuid = pg_strong_random): 32 bita mod 100000 (pristrasnost < 0,003 %)
    v_raw := decode(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'hex');
    v_br  := (get_byte(v_raw, 0)::bigint * 16777216 + get_byte(v_raw, 1) * 65536
              + get_byte(v_raw, 2) * 256 + get_byte(v_raw, 3)) % 100000;
    v_kod := lpad(v_br::text, 5, '0');
    begin
      insert into public.podaci_sifre (sifra, from_id, od_ime, vrsta, naziv, sadrzaj)
      values (v_kod, auth.uid(), nullif(v_ime, ''), p_vrsta, btrim(p_naziv), p_sadrzaj);
      return v_kod;
    exception when unique_violation then
      n := n + 1;
      if n > 20 then raise exception 'Šifra nije napravljena — pokušaj ponovo'; end if;
    end;
  end loop;
end;
$$;

revoke all on function public.posalji_podatke_sifrom(text, text, text) from public;
grant execute on function public.posalji_podatke_sifrom(text, text, text) to authenticated;

notify pgrst, 'reload schema';
