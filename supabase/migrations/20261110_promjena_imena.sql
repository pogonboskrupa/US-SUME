-- Korisnik sam mijenja svoje ime i prezime (v3.7.5). Prijava ide preko ime+prezime ->
-- login_email, koji se NE mijenja, pa stara lozinka/PIN važe i dalje. Ime+prezime moraju
-- ostati jedinstveni (get_login_email vraća prvi red), a RLS korisniku ne dozvoljava da
-- vidi sve tuđe redove — zato provjera ide ovdje, na serveru.
-- Idempotentna; pokreće se RUČNO u Supabase SQL Editoru.
create or replace function public.promijeni_svoje_ime(p_ime text, p_prezime text)
returns void language plpgsql security definer
set search_path = public, auth as $$
declare v_ime text := btrim(coalesce(p_ime,'')); v_pre text := btrim(coalesce(p_prezime,''));
begin
  if auth.uid() is null then raise exception 'Nemaš pristup'; end if;
  if char_length(v_ime) < 2 or char_length(v_ime) > 40 or char_length(v_pre) > 40 then
    raise exception 'Ime mora imati 2–40 znakova'; end if;
  if exists (select 1 from public.korisnici k where k.id <> auth.uid()
             and lower(k.ime) = lower(v_ime) and lower(coalesce(k.prezime,'')) = lower(v_pre)) then
    raise exception 'Korisnik sa tim imenom i prezimenom već postoji'; end if;
  update public.korisnici set ime = v_ime, prezime = v_pre where id = auth.uid();
end; $$;
revoke all on function public.promijeni_svoje_ime(text,text) from public, anon;
grant execute on function public.promijeni_svoje_ime(text,text) to authenticated;
notify pgrst, 'reload schema';
