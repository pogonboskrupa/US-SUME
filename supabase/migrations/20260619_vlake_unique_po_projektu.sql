-- ============================================================
-- VLAKE: jedinstvenost PO PROJEKTU (ne po šumariji)
-- Pokrenuti u Supabase SQL Editor.
-- ------------------------------------------------------------
-- Pravilo (potvrđeno od korisnika):
--   • Vlaka/krak je jedinstvena UNUTAR projekta.
--   • Isto ime (npr. T1) SMIJE postojati u VIŠE različitih projekata.
--   • U istom projektu (za istog korisnika) ne smije biti duplikata.
--
-- Stari constraint je bio UNIQUE(korisnik_id, sumarija, nm) — što je
-- pogrešno spajalo T1 iz projekta A i T1 iz projekta B istog korisnika
-- (drugi projekt bi PREPISAO prvi). Ovdje ga zamjenjujemo ključem koji
-- uključuje projekt_id.
--
-- NAPOMENA: jedinstvenost IZMEĐU različitih projektanata (dva korisnika
-- snime istu vlaku u istom projektu) NE može biti DB constraint jer RLS
-- dozvoljava pisanje samo vlastitih redova (korisnik_id = auth.uid()).
-- Taj slučaj se rješava OBAVIJEŠĆU u aplikaciji.
-- ============================================================

-- 1) Ukloni SVE stare unique constraint-e/indekse na (vlake) koji
--    uključuju nm ali NE uključuju projekt_id.
do $$
declare
  r record;
begin
  -- Table constraints (UNIQUE)
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'vlake' and ns.nspname = 'public' and con.contype = 'u'
      and exists (
        select 1 from unnest(con.conkey) ck
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = ck
        where a.attname = 'nm'
      )
      and not exists (
        select 1 from unnest(con.conkey) ck
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = ck
        where a.attname = 'projekt_id'
      )
  loop
    execute format('alter table public.vlake drop constraint %I', r.conname);
    raise notice 'Dropped constraint %', r.conname;
  end loop;

  -- Standalone unique indexes (nisu vezani za constraint)
  for r in
    select i.relname as idxname
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace ns on ns.oid = t.relnamespace
    where t.relname = 'vlake' and ns.nspname = 'public' and x.indisunique
      and not exists (select 1 from pg_constraint c where c.conindid = x.indexrelid)
      and exists (
        select 1 from unnest(x.indkey) ik
        join pg_attribute a on a.attrelid = x.indrelid and a.attnum = ik
        where a.attname = 'nm'
      )
      and not exists (
        select 1 from unnest(x.indkey) ik
        join pg_attribute a on a.attrelid = x.indrelid and a.attnum = ik
        where a.attname = 'projekt_id'
      )
  loop
    execute format('drop index if exists public.%I', r.idxname);
    raise notice 'Dropped index %', r.idxname;
  end loop;
end $$;

-- 2) Novi unique indeks: ista vlaka jedinstvena PO (korisnik, projekt).
--    NULLS NOT DISTINCT (PG15+) tretira projekt_id NULL kao istu vrijednost,
--    pa i vlake bez projekta dobiju ispravnu zaštitu od duplikata.
do $$
begin
  begin
    create unique index if not exists vlake_korisnik_projekt_nm_uniq
      on public.vlake (korisnik_id, projekt_id, nm) nulls not distinct;
  exception when others then
    -- Fallback za starije Postgres verzije bez NULLS NOT DISTINCT
    create unique index if not exists vlake_korisnik_projekt_nm_uniq
      on public.vlake (korisnik_id, projekt_id, nm);
  end;
end $$;
