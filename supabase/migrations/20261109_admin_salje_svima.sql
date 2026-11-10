-- Admin može poslati trag/mjerenje/KML BILO KOM odobrenom korisniku (v3.7.3), bez
-- ograničenja na istu šumariju. Ostali korisnici ostaju ograničeni na svoju šumariju.
-- Idempotentna; pokreće se RUČNO u Supabase SQL Editoru.
create or replace function public.posalji_podatke(
  p_to uuid, p_vrsta text, p_naziv text, p_sadrzaj text)
returns uuid language plpgsql security definer
set search_path = public, auth as $$
declare
  v_ja_sum text; v_ja_admin boolean; v_on_sum text; v_on_ok boolean; v_id uuid;
begin
  if auth.uid() is null or not public.je_odobren() then raise exception 'Nemaš pristup'; end if;
  if p_to is null or p_to = auth.uid() then raise exception 'Izaberi kolegu'; end if;
  if p_vrsta not in ('trag','poligon','linija','kml') then raise exception 'Nepoznata vrsta podatka'; end if;
  if p_naziv is null or char_length(btrim(p_naziv)) = 0 or char_length(p_naziv) > 120 then raise exception 'Neispravan naziv'; end if;
  if p_sadrzaj is null or char_length(p_sadrzaj) = 0 or char_length(p_sadrzaj) > 3000000 then
    raise exception 'Podatak je prazan ili prevelik (najviše 3 MB)'; end if;

  select k.sumarija, coalesce(k.is_admin,false) into v_ja_sum, v_ja_admin from public.korisnici k where k.id = auth.uid();
  select k.sumarija, coalesce(k.odobren,false) or coalesce(k.is_admin,false)
    into v_on_sum, v_on_ok from public.korisnici k where k.id = p_to;
  if v_on_ok is not true then raise exception 'Kolega nije dostupan'; end if;
  if not v_ja_admin and (v_ja_sum is null or v_on_sum is distinct from v_ja_sum) then
    raise exception 'Dijeljenje je moguće samo unutar iste šumarije'; end if;

  delete from public.primljeni_podaci where expires_at < now();
  if (select count(*) from public.primljeni_podaci where from_id = auth.uid() and to_id = p_to) >= 20 then
    raise exception 'Kolega ima previše neprimljenih podataka od tebe'; end if;
  if (select count(*) from public.primljeni_podaci where from_id = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Previše slanja u kratkom roku — pokušaj kasnije'; end if;

  insert into public.primljeni_podaci (from_id, to_id, sumarija, vrsta, naziv, sadrzaj)
  values (auth.uid(), p_to, coalesce(v_on_sum, v_ja_sum), p_vrsta, btrim(p_naziv), p_sadrzaj)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.posalji_podatke(uuid,text,text,text) from public;
grant execute on function public.posalji_podatke(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
