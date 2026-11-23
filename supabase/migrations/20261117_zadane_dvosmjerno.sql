-- ============================================================
-- ZADANE KOLEGE: OPCIJA "DVOSMJERNO" (v4.2.5)
--
-- Kad admin korisniku zada kolege, i ti kolege su dobijali spisak bez njega — mogli su ga samo
-- primati, a ne i odgovoriti. Sada admin_zadane_spremi ima parametar p_dvosmjerno: kad je uključen,
-- svaki izabrani kolega odmah dobija i ovog korisnika u svom zadanom spisku (pa ima s kim dijeliti
-- fajlove), a kolega uklonjen iz spiska gubi i povratnu vezu. Idempotentna; pokreće se RUČNO u
-- Supabase SQL Editoru (poslije 20261116_zadane_kolege.sql).
-- ============================================================

drop function if exists public.admin_zadane_spremi(uuid, uuid[]);

create or replace function public.admin_zadane_spremi(p_korisnik uuid, p_kolege uuid[], p_dvosmjerno boolean default false)
returns void language plpgsql security definer
set search_path = public, auth as $$
declare v_stari uuid[];
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  if p_korisnik is null or not exists (select 1 from public.korisnici where id = p_korisnik) then raise exception 'Korisnik ne postoji'; end if;
  if coalesce(array_length(p_kolege, 1), 0) > 500 then raise exception 'Previše kolega'; end if;
  select coalesce(array_agg(kolega_id), '{}') into v_stari from public.kolege_zadane where korisnik_id = p_korisnik;
  delete from public.kolege_zadane where korisnik_id = p_korisnik;
  insert into public.kolege_zadane (korisnik_id, kolega_id, created_by)
    select p_korisnik, k.id, auth.uid() from public.korisnici k
     where k.id = any (coalesce(p_kolege, '{}'::uuid[])) and k.id <> p_korisnik
    on conflict do nothing;
  if p_dvosmjerno then
    -- uklonjeni kolege gube povratnu vezu; izabrani je dobijaju
    delete from public.kolege_zadane z
     where z.kolega_id = p_korisnik and z.korisnik_id = any (v_stari)
       and not (z.korisnik_id = any (coalesce(p_kolege, '{}'::uuid[])));
    insert into public.kolege_zadane (korisnik_id, kolega_id, created_by)
      select k.id, p_korisnik, auth.uid() from public.korisnici k
       where k.id = any (coalesce(p_kolege, '{}'::uuid[])) and k.id <> p_korisnik
      on conflict do nothing;
  end if;
end; $$;

revoke all on function public.admin_zadane_spremi(uuid,uuid[],boolean) from public;
grant execute on function public.admin_zadane_spremi(uuid,uuid[],boolean) to authenticated;
notify pgrst, 'reload schema';
