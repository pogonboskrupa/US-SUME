-- ============================================================
-- PRIMLJENI PODACI — dijeljenje tragova/poligona/KML-a unutar iste šumarije
-- (v3.5.0). Podatak NE ostaje na serveru: ovo je samo PRIVREMENI SANDUČIĆ.
--
--   • pošiljalac pozove posalji_podatke() → red u primljeni_podaci
--   • primalac (online) povuče svoje redove, SPREMI ih lokalno (IndexedDB) i tek
--     onda obriše red sa servera — nakon toga na serveru nema ničega
--   • neprimljeno se samo briše poslije 7 dana (expires_at)
--
-- Zašto sandučić, a ne čisti Realtime broadcast: broadcast stiže samo ako je
-- primalac ONLINE u tom trenutku; terenski radnik često nije. Sandučić čeka dok
-- se ne pojavi veza, a ne postaje arhiva jer ga primalac sam isprazni.
--
-- Pošiljalac i primalac MORAJU biti u istoj šumariji (provjera je ovdje, na
-- serveru — klijentski filter je samo UX). Upis ide ISKLJUČIVO kroz funkciju
-- (nema insert politike), čitanje i brisanje samo primalac.
--
-- Idempotentna. Pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create table if not exists public.primljeni_podaci (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  sumarija   text,
  vrsta      text not null check (vrsta in ('trag', 'poligon', 'linija', 'kml')),
  naziv      text not null check (char_length(naziv) between 1 and 120),
  sadrzaj    text not null check (char_length(sadrzaj) <= 3000000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create index if not exists primljeni_podaci_to_idx on public.primljeni_podaci (to_id, created_at);
create index if not exists primljeni_podaci_istek_idx on public.primljeni_podaci (expires_at);

alter table public.primljeni_podaci enable row level security;

drop policy if exists "primljeni_podaci_select" on public.primljeni_podaci;
create policy "primljeni_podaci_select" on public.primljeni_podaci
  for select to authenticated using (to_id = auth.uid() and expires_at > now());

drop policy if exists "primljeni_podaci_delete" on public.primljeni_podaci;
create policy "primljeni_podaci_delete" on public.primljeni_podaci
  for delete to authenticated using (to_id = auth.uid());
-- Namjerno NEMA insert/update politike — upis samo kroz posalji_podatke().

drop policy if exists "zzz_odobren" on public.primljeni_podaci;
create policy "zzz_odobren" on public.primljeni_podaci
  as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());

create or replace function public.posalji_podatke(
  p_to      uuid,
  p_vrsta   text,
  p_naziv   text,
  p_sadrzaj text
)
returns uuid language plpgsql security definer
set search_path = public, auth as $$
declare
  v_ja_sum  text;
  v_on_sum  text;
  v_on_ok   boolean;
  v_id      uuid;
begin
  if auth.uid() is null or not public.je_odobren() then
    raise exception 'Nemaš pristup';
  end if;
  if p_to is null or p_to = auth.uid() then
    raise exception 'Izaberi kolegu';
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

  select k.sumarija into v_ja_sum from public.korisnici k where k.id = auth.uid();
  select k.sumarija, coalesce(k.odobren, false) or coalesce(k.is_admin, false)
    into v_on_sum, v_on_ok from public.korisnici k where k.id = p_to;
  if v_on_ok is not true then
    raise exception 'Kolega nije dostupan';
  end if;
  if v_ja_sum is null or v_on_sum is distinct from v_ja_sum then
    raise exception 'Dijeljenje je moguće samo unutar iste šumarije';
  end if;

  -- Istekli neprimljeni podaci se brišu pri svakom slanju (nema cron-a u projektu).
  delete from public.primljeni_podaci where expires_at < now();

  if (select count(*) from public.primljeni_podaci where from_id = auth.uid() and to_id = p_to) >= 20 then
    raise exception 'Kolega ima previše neprimljenih podataka od tebe';
  end if;
  if (select count(*) from public.primljeni_podaci where from_id = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Previše slanja u kratkom roku — pokušaj kasnije';
  end if;

  insert into public.primljeni_podaci (from_id, to_id, sumarija, vrsta, naziv, sadrzaj)
  values (auth.uid(), p_to, v_ja_sum, p_vrsta, btrim(p_naziv), p_sadrzaj)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.posalji_podatke(uuid, text, text, text) from public;
grant execute on function public.posalji_podatke(uuid, text, text, text) to authenticated;

-- Realtime: primalac dobija događaj čim stigne novi red (RLS ga ograničava na njegove).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'primljeni_podaci') then
    alter publication supabase_realtime add table public.primljeni_podaci;
  end if;
end $$;

notify pgrst, 'reload schema';
