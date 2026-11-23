-- ============================================================
-- ADMIN: S KIM KORISNIK VEĆ MOŽE DIJELITI PODATKE (v4.3.6)
--
-- Uređivač zadanih kolega je pokazivao samo admin-zadane kolege ("Trenutno zadano: 0"), pa admin nije
-- vidio da korisnik već ima kolege iz grupa, preko šifre ili iz svoje šumarije. Ova funkcija vraća sve
-- s kojima korisnik može slati/primati podatke i odakle veza dolazi (ista pravila kao posalji_podatke).
-- Samo admin. Idempotentna; pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create or replace function public.admin_korisnik_dijeljenje(p_user uuid)
returns table (id uuid, ime text, sumarija text, izvori text[])
language plpgsql security definer
set search_path = public, auth as $$
declare v_sum text;
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  select k.sumarija into v_sum from public.korisnici k where k.id = p_user;
  return query
    with veze as (
      select z.kolega_id as kid, 'zadano'::text as izvor from public.kolege_zadane z where z.korisnik_id = p_user
      union all
      select b.korisnik_id, 'grupa' from public.kolege_grupe_clanovi a
        join public.kolege_grupe_clanovi b on b.grupa_id = a.grupa_id and b.korisnik_id <> p_user
       where a.korisnik_id = p_user
      union all
      select c.b, 'šifra' from public.kontakti c where c.a = p_user
      union all
      select k.id, 'šumarija' from public.korisnici k
       where v_sum is not null and v_sum <> 'ŠPD US ŠUME' and k.sumarija = v_sum and k.id <> p_user
    )
    select k.id, btrim(coalesce(k.ime,'') || ' ' || coalesce(k.prezime,'')), k.sumarija,
           array_agg(distinct v.izvor order by v.izvor)
      from veze v join public.korisnici k on k.id = v.kid
     where coalesce(k.odobren,false) or coalesce(k.is_admin,false)
     group by k.id, k.ime, k.prezime, k.sumarija
     order by 2;
end; $$;

revoke all on function public.admin_korisnik_dijeljenje(uuid) from public;
grant execute on function public.admin_korisnik_dijeljenje(uuid) to authenticated;
notify pgrst, 'reload schema';
