-- Admin mijenja ime i prezime BILO KOG korisnika (v4.2.6). Prijava ide preko ime+prezime ->
-- login_email (koji se ne mijenja), pa PIN važi i dalje; korisnik se od sada prijavljuje novim
-- imenom. Ime+prezime moraju ostati jedinstveni (get_login_email vraća prvi red).
-- Idempotentna; pokreće se RUČNO u Supabase SQL Editoru.
create or replace function public.admin_promijeni_ime(p_user uuid, p_ime text, p_prezime text)
returns void language plpgsql security definer
set search_path = public, auth as $$
declare v_ime text := btrim(coalesce(p_ime,'')); v_pre text := btrim(coalesce(p_prezime,''));
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  if p_user is null or not exists (select 1 from public.korisnici where id = p_user) then raise exception 'Korisnik ne postoji'; end if;
  if char_length(v_ime) < 2 or char_length(v_ime) > 40 or char_length(v_pre) > 40 then
    raise exception 'Ime mora imati 2–40 znakova'; end if;
  if exists (select 1 from public.korisnici k where k.id <> p_user
             and lower(k.ime) = lower(v_ime) and lower(coalesce(k.prezime,'')) = lower(v_pre)) then
    raise exception 'Korisnik sa tim imenom i prezimenom već postoji'; end if;
  update public.korisnici set ime = v_ime, prezime = v_pre where id = p_user;
end; $$;
revoke all on function public.admin_promijeni_ime(uuid,text,text) from public, anon;
grant execute on function public.admin_promijeni_ime(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
